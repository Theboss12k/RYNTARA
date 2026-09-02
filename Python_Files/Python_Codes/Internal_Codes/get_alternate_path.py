import math
import heapq
import sys
import json
import traceback
import numpy as np

try:
    from scipy.interpolate import splprep, splev
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

class AStar3DPlanner:
    def __init__(
        self,
        start,
        goal,
        obstacles,
        world_bounds,
        resolution=2.0,
        safety_margin=5.0,
        allow_height_variation=False,
        z_penalty=4.0, # Climbing is heavily penalized to encourage lateral routing unless blocked
        heuristic_weight=2.5
    ):
        self.start = np.asarray(start, dtype=float)
        self.goal = np.asarray(goal, dtype=float)
        self.obstacles = obstacles
        self.world_bounds = world_bounds
        self.resolution = float(resolution)
        self.safety_margin = float(safety_margin)
        self.allow_height_variation = bool(allow_height_variation)
        self.z_penalty = float(z_penalty)
        self.heuristic_weight = float(heuristic_weight)

        self.grid_shape = None
        self.occupancy = None

    def build_grid(self):
        self.grid_shape = (
            max(1, int(round((self.world_bounds["xmax"] - self.world_bounds["xmin"]) / self.resolution)) + 1),
            max(1, int(round((self.world_bounds["ymax"] - self.world_bounds["ymin"]) / self.resolution)) + 1),
            max(1, int(round((self.world_bounds["zmax"] - self.world_bounds["zmin"]) / self.resolution)) + 1),
        )

    def world_to_grid(self, point):
        x, y, z = map(float, point)
        return (
            int(round((x - self.world_bounds["xmin"]) / self.resolution)),
            int(round((y - self.world_bounds["ymin"]) / self.resolution)),
            int(round((z - self.world_bounds["zmin"]) / self.resolution)),
        )

    def grid_to_world(self, node):
        gx, gy, gz = node
        return np.array([
            self.world_bounds["xmin"] + gx * self.resolution,
            self.world_bounds["ymin"] + gy * self.resolution,
            self.world_bounds["zmin"] + gz * self.resolution,
        ], dtype=float)

    def node_in_bounds(self, node):
        if self.grid_shape is None: return False
        gx, gy, gz = node
        return (0 <= gx < self.grid_shape[0] and 0 <= gy < self.grid_shape[1] and 0 <= gz < self.grid_shape[2])

    def point_inside_obstacle(self, point):
        x, y, z = map(float, point)
        for obstacle in self.obstacles:
            cx, cy = float(obstacle["x"]), float(obstacle["y"])
            radius = float(obstacle["radius"]) + self.safety_margin
            base_z = float(obstacle.get("base_z", 0.0))
            top_z = base_z + float(obstacle["height"]) + self.safety_margin

            if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 and z >= max(0.0, base_z - self.safety_margin) and z <= top_z):
                return True
        return False

    def build_occupancy_grid(self):
        self.build_grid()
        self.occupancy = np.zeros(self.grid_shape, dtype=np.bool_)
        xmin, ymin, zmin = self.world_bounds["xmin"], self.world_bounds["ymin"], self.world_bounds["zmin"]

        for obstacle in self.obstacles:
            cx, cy = float(obstacle["x"]), float(obstacle["y"])
            radius = float(obstacle["radius"]) + self.safety_margin
            base_z = float(obstacle.get("base_z", 0.0))
            top_z = base_z + float(obstacle["height"]) + self.safety_margin

            min_gx = max(0, int(math.floor((cx - radius - xmin) / self.resolution)))
            max_gx = min(self.grid_shape[0] - 1, int(math.ceil((cx + radius - xmin) / self.resolution)))
            min_gy = max(0, int(math.floor((cy - radius - ymin) / self.resolution)))
            max_gy = min(self.grid_shape[1] - 1, int(math.ceil((cy + radius - ymin) / self.resolution)))
            min_gz = max(0, int(math.floor((max(0.0, base_z - self.safety_margin) - zmin) / self.resolution)))
            max_gz = min(self.grid_shape[2] - 1, int(math.ceil((top_z - zmin) / self.resolution)))

            for gx in range(min_gx, max_gx + 1):
                x = xmin + gx * self.resolution
                dx = x - cx
                for gy in range(min_gy, max_gy + 1):
                    y = ymin + gy * self.resolution
                    dy = y - cy
                    if dx * dx + dy * dy > radius * radius: continue
                    for gz in range(min_gz, max_gz + 1):
                        z = zmin + gz * self.resolution
                        if base_z - self.safety_margin <= z <= top_z:
                            self.occupancy[gx, gy, gz] = True

    def node_is_free(self, node):
        if not self.node_in_bounds(node): return False
        return not self.occupancy[node[0], node[1], node[2]]

    def segment_is_free(self, p1, p2):
        p1, p2 = np.asarray(p1, dtype=float), np.asarray(p2, dtype=float)
        distance = float(np.linalg.norm(p2 - p1))
        spacing = max(self.resolution * 0.20, 0.025)
        samples = max(2, int(math.ceil(distance / spacing)))

        for i in range(samples + 1):
            if self.point_inside_obstacle(p1 + (i / samples) * (p2 - p1)): return False
        return True

    def heuristic(self, a, b):
        dx, dy = a[0] - b[0], a[1] - b[1]
        dz = (a[2] - b[2]) * self.z_penalty
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    @staticmethod
    def directions_26():
        result = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if dx == 0 and dy == 0 and dz == 0: continue
                    result.append((dx, dy, dz))
        return result

    def transition_is_valid(self, current, neighbor):
        if not self.node_is_free(neighbor): return False
        return self.segment_is_free(self.grid_to_world(current), self.grid_to_world(neighbor))

    def solve(self):
        self.build_occupancy_grid()
        start_node, goal_node = self.world_to_grid(self.start), self.world_to_grid(self.goal)

        if not self.node_in_bounds(start_node) or not self.node_in_bounds(goal_node):
            raise ValueError("Endpoints outside bounding box.")
        if not self.node_is_free(start_node) or not self.node_is_free(goal_node):
            raise ValueError("Start/End point is physically inside an obstacle.")

        open_heap = []
        counter = 0
        heapq.heappush(open_heap, (self.heuristic(start_node, goal_node) * self.heuristic_weight, counter, start_node))

        came_from = {}
        g_score = {start_node: 0.0}
        closed = set()
        directions = self.directions_26()

        while open_heap:
            _, _, current = heapq.heappop(open_heap)

            if current in closed: continue
            closed.add(current)

            if current == goal_node:
                path = []
                node = current
                while node in came_from:
                    path.append(self.grid_to_world(node))
                    node = came_from[node]
                path.append(self.grid_to_world(start_node))
                path.reverse()
                path = np.asarray(path, dtype=float)
                path[0], path[-1] = self.start, self.goal
                return self.simplify_path(path)

            for dx, dy, dz in directions:
                # CRITICAL LOGIC: If altitude shift is not allowed, strictly forbid all Z movement.
                if not self.allow_height_variation and dz != 0: continue

                neighbor = (current[0] + dx, current[1] + dy, current[2] + dz)
                if not self.node_in_bounds(neighbor) or neighbor in closed: continue
                if not self.transition_is_valid(current, neighbor): continue

                cost = math.sqrt(dx * dx + dy * dy + (dz * self.z_penalty) ** 2)
                tentative_g = g_score[current] + cost

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f = tentative_g + (self.heuristic(neighbor, goal_node) * self.heuristic_weight)
                    counter += 1
                    heapq.heappush(open_heap, (f, counter, neighbor))
        return None

    def simplify_path(self, path):
        if path is None or len(path) <= 2: return path
        result = [path[0]]
        anchor = 0
        while anchor < len(path) - 1:
            furthest = anchor + 1
            for candidate in range(anchor + 1, len(path)):
                if self.segment_is_free(path[anchor], path[candidate]): furthest = candidate
                else: break
            result.append(path[furthest])
            anchor = furthest
        return np.asarray(result, dtype=float)


class SplineSmoother:
    def __init__(self, planner): self.planner = planner

    @staticmethod
    def _parameterize(path):
        distances = np.linalg.norm(np.diff(path, axis=0), axis=1)
        cumulative = np.concatenate([[0.0], np.cumsum(distances)])
        if cumulative[-1] <= 1e-9: return np.linspace(0.0, 1.0, len(path))
        return cumulative / cumulative[-1]

    def smooth(self, path, num_spline_points=100):
        if path is None or len(path) < 4 or not SCIPY_AVAILABLE:
            return path.copy() if path is not None else None

        clean = [path[0]]
        for point in path[1:]:
            if np.linalg.norm(point - clean[-1]) > 1e-8: clean.append(point)
        path = np.asarray(clean, dtype=float)

        if len(path) < 4: return path.copy()
        u = self._parameterize(path)
        k = min(3, len(path) - 1)

        try: tck, _ = splprep([path[:, 0], path[:, 1], path[:, 2]], u=u, s=0.0, k=k)
        except Exception: return path.copy()

        u_new = np.linspace(0.0, 1.0, max(10, num_spline_points))
        smoothed = np.column_stack(splev(u_new, tck))
        smoothed[0], smoothed[-1] = path[0], path[-1]

        for i in range(len(smoothed) - 1):
            if not self.planner.segment_is_free(smoothed[i], smoothed[i + 1]): return path.copy()

        return smoothed

def plan_path(
    start, goal, obstacle_coords,
    min_clearance=0.0, allow_height_variation=False,
    use_spline=True, num_spline_points=100, resolution=2.0
):
    min_x, max_x = min(start[0], goal[0]), max(start[0], goal[0])
    min_y, max_y = min(start[1], goal[1]), max(start[1], goal[1])
    dist = math.hypot(goal[0] - start[0], goal[1] - start[1])
    buffer_xy = max(150.0, dist * 0.5)

    formatted_obstacles = []

    for idx, item in enumerate(obstacle_coords):
        x, y = float(item[0]), float(item[1])
        if len(item) == 5:
            base_z, r = float(item[2]), float(item[3])
            height = max(0.1, float(item[4]) - base_z)
        elif len(item) == 4:
            base_z, r = float(item[2]), float(item[3])
            height = 50.0
        else:
            base_z, r, height = 0.0, 10.0, 50.0

        if (x + r >= min_x - buffer_xy and x - r <= max_x + buffer_xy and
            y + r >= min_y - buffer_xy and y - r <= max_y + buffer_xy):
            formatted_obstacles.append({
                "id": idx + 1, "x": x, "y": y, "base_z": base_z, "radius": r, "height": height
            })

    all_x = [start[0], goal[0]] + [o["x"] for o in formatted_obstacles]
    all_y = [start[1], goal[1]] + [o["y"] for o in formatted_obstacles]
    all_z = [start[2], goal[2]] + [o["base_z"] + o["height"] for o in formatted_obstacles]
    max_r = max([o["radius"] for o in formatted_obstacles] + [50.0])

    world_bounds = {
        "xmin": min(all_x) - min_clearance - max_r,
        "xmax": max(all_x) + min_clearance + max_r,
        "ymin": min(all_y) - min_clearance - max_r,
        "ymax": max(all_y) + min_clearance + max_r,
        "zmin": max(0.0, min(min(all_z) - 5.0, 0.0)),
        "zmax": max(all_z) + 50.0,
    }

    planner = AStar3DPlanner(
        start=start, goal=goal, obstacles=formatted_obstacles,
        world_bounds=world_bounds, resolution=resolution,
        safety_margin=min_clearance, allow_height_variation=allow_height_variation
    )

    raw_path = planner.solve()
    if raw_path is None: return None

    if use_spline:
        smoother = SplineSmoother(planner)
        return smoother.smooth(raw_path, num_spline_points=num_spline_points)
    return raw_path

# ============================================================
# CLI WRAPPER FOR JAVA INTEGRATION
# ============================================================
if __name__ == "__main__":

    sys.stderr.write("[PYTHON START] Booting FAST A* 3D Planner script...\n")

    if len(sys.argv) > 1:
        try:
            with open(sys.argv[1], 'r') as f:
                data = json.load(f)

            start_geo, goal_geo = data.get('start'), data.get('goal')
            obstacles_geo, allow_height = data.get('obstacles', []), data.get('allow_height_variation', True)

            ref_lon, ref_lat = start_geo[0], start_geo[1]
            m_per_deg_lat = 111320.0
            m_per_deg_lon = 111320.0 * math.cos(math.radians(ref_lat))

            def geo_to_local(lon, lat, alt): return [(lon - ref_lon) * m_per_deg_lon, (lat - ref_lat) * m_per_deg_lat, alt]
            def local_to_geo(x, y, alt): return [ref_lon + (x / m_per_deg_lon), ref_lat + (y / m_per_deg_lat), alt]

            start_local, goal_local = geo_to_local(*start_geo), geo_to_local(*goal_geo)

            obs_local = []
            for obs in obstacles_geo:
                lx, ly, l_altMin = geo_to_local(obs[0], obs[1], obs[2])
                altMax = obs[4] if len(obs) > 4 else obs[2] + 50.0
                radius = obs[3] if len(obs) > 3 else 10.0
                obs_local.append((lx, ly, l_altMin, radius, altMax))

            dist_m = math.sqrt((goal_local[0] - start_local[0])**2 + (goal_local[1] - start_local[1])**2)
            dyn_res = max(4.0, dist_m / 150.0)

            sys.stderr.write(f"[PYTHON INFO] Route Distance: {dist_m:.1f}m | Grid Res: {dyn_res:.1f}m\n")

            path_local = plan_path(
                start=start_local, goal=goal_local, obstacle_coords=obs_local,
                min_clearance=0.0, allow_height_variation=allow_height,
                use_spline=True, resolution=dyn_res
            )

            if path_local is not None:
                res_geo = [{"longitude": float(glon), "latitude": float(glat), "altitude": float(galt)}
                           for glon, glat, galt in (local_to_geo(*pt) for pt in path_local)]
                sys.stderr.write(f"[PYTHON SUCCESS] Found fast route with {len(res_geo)} waypoints.\n")
                print(json.dumps(res_geo))
            else:
                sys.stderr.write("[PYTHON WARNING] A* failed. Path returned None.\n")
                print(json.dumps([]))

        except Exception as e:
            sys.stderr.write(f"[PYTHON CRASH] An exception occurred:\n")
            traceback.print_exc(file=sys.stderr)
            print(json.dumps([]))