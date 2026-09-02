import math
import heapq
import csv
import os
from datetime import datetime

import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, Button, RadioButtons, TextBox
from matplotlib.animation import FuncAnimation
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

try:
    from scipy.interpolate import splprep, splev
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


# ============================================================
# WORLD
# ============================================================

WORLD_BOUNDS = {
    "xmin": 0.0,
    "xmax": 10.0,
    "ymin": 0.0,
    "ymax": 10.0,
    "zmin": 0.0,
    "zmax": 10.0,
}

DEFAULT_GRID_RESOLUTION = 0.25
DEFAULT_SAFETY_MARGIN = 0.50

DEFAULT_START = np.array([1.0, 1.0, 2.0], dtype=float)
DEFAULT_GOAL = np.array([9.0, 9.0, 2.0], dtype=float)

DEFAULT_OBSTACLES = [
    {
        "id": 1,
        "x": 5.0,
        "y": 5.0,
        "base_z": 0.0,
        "radius": 1.5,
        "height": 4.0,
    },
    {
        "id": 2,
        "x": 3.0,
        "y": 7.0,
        "base_z": 0.0,
        "radius": 0.8,
        "height": 2.5,
    },
    {
        "id": 3,
        "x": 7.0,
        "y": 3.0,
        "base_z": 0.0,
        "radius": 1.0,
        "height": 5.5,
    },
]

NEW_OBSTACLE_X = 5.0
NEW_OBSTACLE_Y = 5.0
NEW_OBSTACLE_Z = 0.0
NEW_OBSTACLE_RADIUS = 0.75
NEW_OBSTACLE_HEIGHT = 3.0


# ============================================================
# 3D A*
# ============================================================

class AStar3DPlanner:

    def __init__(
        self,
        start,
        goal,
        obstacles,
        world_bounds,
        resolution,
        safety_margin,
        allow_height_variation,
    ):
        self.start = np.asarray(start, dtype=float)
        self.goal = np.asarray(goal, dtype=float)
        self.obstacles = obstacles
        self.world_bounds = world_bounds
        self.resolution = float(resolution)
        self.safety_margin = float(safety_margin)
        self.allow_height_variation = bool(allow_height_variation)

        self.grid_shape = None
        self.occupancy = None
        self.raw_path = None
        self.simplified_path = None

    def build_grid(self):
        self.grid_shape = (
            int(round(
                (
                    self.world_bounds["xmax"]
                    - self.world_bounds["xmin"]
                ) / self.resolution
            )) + 1,

            int(round(
                (
                    self.world_bounds["ymax"]
                    - self.world_bounds["ymin"]
                ) / self.resolution
            )) + 1,

            int(round(
                (
                    self.world_bounds["zmax"]
                    - self.world_bounds["zmin"]
                ) / self.resolution
            )) + 1,
        )

    def world_to_grid(self, point):
        x, y, z = map(float, point)

        return (
            int(round(
                (x - self.world_bounds["xmin"])
                / self.resolution
            )),
            int(round(
                (y - self.world_bounds["ymin"])
                / self.resolution
            )),
            int(round(
                (z - self.world_bounds["zmin"])
                / self.resolution
            )),
        )

    def grid_to_world(self, node):
        gx, gy, gz = node

        return np.array([
            self.world_bounds["xmin"] + gx * self.resolution,
            self.world_bounds["ymin"] + gy * self.resolution,
            self.world_bounds["zmin"] + gz * self.resolution,
        ], dtype=float)

    def node_in_bounds(self, node):
        if self.grid_shape is None:
            return False

        gx, gy, gz = node

        return (
            0 <= gx < self.grid_shape[0]
            and 0 <= gy < self.grid_shape[1]
            and 0 <= gz < self.grid_shape[2]
        )

    def point_inside_obstacle(self, point):
        x, y, z = map(float, point)

        for obstacle in self.obstacles:
            cx = float(obstacle["x"])
            cy = float(obstacle["y"])

            radius = (
                float(obstacle["radius"])
                + self.safety_margin
            )

            base_z = float(obstacle.get("base_z", 0.0))

            top_z = (
                base_z
                + float(obstacle["height"])
                + self.safety_margin
            )

            if (
                (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
                and z >= base_z - self.safety_margin
                and z <= top_z
            ):
                return True

        return False

    def build_occupancy_grid(self):
        self.build_grid()

        self.occupancy = np.zeros(
            self.grid_shape,
            dtype=np.bool_
        )

        xmin = self.world_bounds["xmin"]
        ymin = self.world_bounds["ymin"]
        zmin = self.world_bounds["zmin"]

        for obstacle in self.obstacles:
            cx = float(obstacle["x"])
            cy = float(obstacle["y"])

            radius = (
                float(obstacle["radius"])
                + self.safety_margin
            )

            base_z = float(obstacle.get("base_z", 0.0))

            top_z = (
                base_z
                + float(obstacle["height"])
                + self.safety_margin
            )

            min_gx = max(
                0,
                int(math.floor(
                    (cx - radius - xmin)
                    / self.resolution
                ))
            )

            max_gx = min(
                self.grid_shape[0] - 1,
                int(math.ceil(
                    (cx + radius - xmin)
                    / self.resolution
                ))
            )

            min_gy = max(
                0,
                int(math.floor(
                    (cy - radius - ymin)
                    / self.resolution
                ))
            )

            max_gy = min(
                self.grid_shape[1] - 1,
                int(math.ceil(
                    (cy + radius - ymin)
                    / self.resolution
                ))
            )

            min_gz = max(
                0,
                int(math.floor(
                    (
                        base_z
                        - self.safety_margin
                        - zmin
                    ) / self.resolution
                ))
            )

            max_gz = min(
                self.grid_shape[2] - 1,
                int(math.ceil(
                    (top_z - zmin)
                    / self.resolution
                ))
            )

            for gx in range(min_gx, max_gx + 1):
                x = xmin + gx * self.resolution
                dx = x - cx

                for gy in range(min_gy, max_gy + 1):
                    y = ymin + gy * self.resolution
                    dy = y - cy

                    if dx * dx + dy * dy > radius * radius:
                        continue

                    for gz in range(min_gz, max_gz + 1):
                        z = zmin + gz * self.resolution

                        if (
                            z >= base_z - self.safety_margin
                            and z <= top_z
                        ):
                            self.occupancy[gx, gy, gz] = True

    def node_is_free(self, node):
        if not self.node_in_bounds(node):
            return False

        gx, gy, gz = node

        return not self.occupancy[gx, gy, gz]

    def segment_is_free(self, p1, p2):
        p1 = np.asarray(p1, dtype=float)
        p2 = np.asarray(p2, dtype=float)

        distance = float(
            np.linalg.norm(p2 - p1)
        )

        spacing = max(
            self.resolution * 0.20,
            0.025
        )

        samples = max(
            2,
            int(math.ceil(distance / spacing))
        )

        for i in range(samples + 1):
            t = i / samples
            point = p1 + t * (p2 - p1)

            if self.point_inside_obstacle(point):
                return False

        return True

    @staticmethod
    def heuristic(a, b):
        dx = a[0] - b[0]
        dy = a[1] - b[1]
        dz = a[2] - b[2]

        return math.sqrt(
            dx * dx +
            dy * dy +
            dz * dz
        )

    @staticmethod
    def directions_26():
        result = []

        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):

                    if dx == 0 and dy == 0 and dz == 0:
                        continue

                    result.append((dx, dy, dz))

        return result

    def transition_is_valid(self, current, neighbor):
        if not self.node_is_free(neighbor):
            return False

        p1 = self.grid_to_world(current)
        p2 = self.grid_to_world(neighbor)

        return self.segment_is_free(p1, p2)

    def solve(self):
        self.build_occupancy_grid()

        start_node = self.world_to_grid(self.start)
        goal_node = self.world_to_grid(self.goal)

        if not self.node_in_bounds(start_node):
            raise ValueError("Start point is outside the world.")

        if not self.node_in_bounds(goal_node):
            raise ValueError("End point is outside the world.")

        if not self.node_is_free(start_node):
            raise ValueError(
                "Start point is inside an obstacle/safety zone."
            )

        if not self.allow_height_variation:
            goal_node = (
                goal_node[0],
                goal_node[1],
                start_node[2]
            )

        if not self.node_is_free(goal_node):
            raise ValueError(
                "End point is inside an obstacle/safety zone."
            )

        open_heap = []
        counter = 0

        heapq.heappush(
            open_heap,
            (
                self.heuristic(start_node, goal_node),
                counter,
                start_node
            )
        )

        came_from = {}
        g_score = {start_node: 0.0}
        closed = set()

        directions = self.directions_26()

        while open_heap:

            _, _, current = heapq.heappop(open_heap)

            if current in closed:
                continue

            closed.add(current)

            if current == goal_node:

                path = []
                node = current

                while node in came_from:
                    path.append(
                        self.grid_to_world(node)
                    )
                    node = came_from[node]

                path.append(
                    self.grid_to_world(start_node)
                )

                path.reverse()

                path = np.asarray(
                    path,
                    dtype=float
                )

                path[0] = self.start

                if self.allow_height_variation:
                    path[-1] = self.goal
                else:
                    path[-1] = np.array([
                        self.goal[0],
                        self.goal[1],
                        self.start[2]
                    ])

                self.raw_path = path

                self.simplified_path = (
                    self.simplify_path(path)
                )

                return self.simplified_path

            for dx, dy, dz in directions:

                neighbor = (
                    current[0] + dx,
                    current[1] + dy,
                    current[2] + dz
                )

                if not self.node_in_bounds(neighbor):
                    continue

                if (
                    not self.allow_height_variation
                    and neighbor[2] != start_node[2]
                ):
                    continue

                if neighbor in closed:
                    continue

                if not self.transition_is_valid(
                    current,
                    neighbor
                ):
                    continue

                cost = math.sqrt(
                    dx * dx +
                    dy * dy +
                    dz * dz
                )

                tentative_g = (
                    g_score[current] + cost
                )

                if (
                    neighbor not in g_score
                    or tentative_g < g_score[neighbor]
                ):
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g

                    f = (
                        tentative_g
                        + self.heuristic(
                            neighbor,
                            goal_node
                        )
                    )

                    counter += 1

                    heapq.heappush(
                        open_heap,
                        (
                            f,
                            counter,
                            neighbor
                        )
                    )

        self.raw_path = None
        self.simplified_path = None

        return None

    def simplify_path(self, path):
        if path is None:
            return None

        if len(path) <= 2:
            return path.copy()

        result = [path[0]]
        anchor = 0

        while anchor < len(path) - 1:

            furthest = anchor + 1

            for candidate in range(
                anchor + 1,
                len(path)
            ):
                if self.segment_is_free(
                    path[anchor],
                    path[candidate]
                ):
                    furthest = candidate
                else:
                    break

            result.append(path[furthest])
            anchor = furthest

        return np.asarray(
            result,
            dtype=float
        )


# ============================================================
# SPLINE
# ============================================================

class SplineSmoother:

    def __init__(self, planner):
        self.planner = planner

    @staticmethod
    def _parameterize(path):
        distances = np.linalg.norm(
            np.diff(path, axis=0),
            axis=1
        )

        cumulative = np.concatenate([
            [0.0],
            np.cumsum(distances)
        ])

        if cumulative[-1] <= 1e-9:
            return np.linspace(
                0.0,
                1.0,
                len(path)
            )

        return cumulative / cumulative[-1]

    def smooth(self, path):

        if path is None:
            return None

        if len(path) < 4:
            return path.copy()

        if not SCIPY_AVAILABLE:
            return path.copy()

        clean = [path[0]]

        for point in path[1:]:
            if np.linalg.norm(
                point - clean[-1]
            ) > 1e-8:
                clean.append(point)

        path = np.asarray(
            clean,
            dtype=float
        )

        if len(path) < 4:
            return path.copy()

        u = self._parameterize(path)

        k = min(
            3,
            len(path) - 1
        )

        try:
            tck, _ = splprep(
                [
                    path[:, 0],
                    path[:, 1],
                    path[:, 2]
                ],
                u=u,
                s=0.0,
                k=k
            )
        except Exception:
            return path.copy()

        sample_count = max(
            250,
            len(path) * 35
        )

        u_new = np.linspace(
            0.0,
            1.0,
            sample_count
        )

        smoothed = np.column_stack(
            splev(u_new, tck)
        )

        smoothed[0] = path[0]
        smoothed[-1] = path[-1]

        smoothed[:, 0] = np.clip(
            smoothed[:, 0],
            self.planner.world_bounds["xmin"],
            self.planner.world_bounds["xmax"]
        )

        smoothed[:, 1] = np.clip(
            smoothed[:, 1],
            self.planner.world_bounds["ymin"],
            self.planner.world_bounds["ymax"]
        )

        smoothed[:, 2] = np.clip(
            smoothed[:, 2],
            self.planner.world_bounds["zmin"],
            self.planner.world_bounds["zmax"]
        )

        if not self.planner.allow_height_variation:
            smoothed[:, 2] = path[0, 2]

        for i in range(len(smoothed) - 1):
            if not self.planner.segment_is_free(
                smoothed[i],
                smoothed[i + 1]
            ):
                return path.copy()

        return smoothed


# ============================================================
# GUI
# ============================================================

class AvoidanceGUI:

    def __init__(
        self,
        start=DEFAULT_START,
        goal=DEFAULT_GOAL
    ):

        self.start = np.asarray(
            start,
            dtype=float
        )

        self.goal = np.asarray(
            goal,
            dtype=float
        )

        self.obstacles = [
            dict(o)
            for o in DEFAULT_OBSTACLES
        ]

        self.original_obstacles = [
            dict(o)
            for o in DEFAULT_OBSTACLES
        ]

        self.next_obstacle_id = (
            max(
                [o["id"] for o in self.obstacles],
                default=0
            ) + 1
        )

        self.selected_obstacle_index = 0
        self.height_variation = False
        self.spline_enabled = True

        self.grid_resolution = (
            DEFAULT_GRID_RESOLUTION
        )

        self.safety_margin = (
            DEFAULT_SAFETY_MARGIN
        )

        self.planner = None
        self.raw_path = None
        self.a_star_path = None
        self.final_path = None

        self.animation = None
        self.dragging_obstacle = False

        self.fig = plt.figure(
            figsize=(16, 11)
        )

        self.ax = self.fig.add_subplot(
            111,
            projection="3d"
        )

        plt.subplots_adjust(
            left=0.04,
            right=0.98,
            top=0.94,
            bottom=0.34
        )

        self._configure_axes()

        self.start_artist, = self.ax.plot(
            [], [], [],
            marker="o",
            markersize=11,
            linestyle="None",
            label="START"
        )

        self.goal_artist, = self.ax.plot(
            [], [], [],
            marker="X",
            markersize=12,
            linestyle="None",
            label="END"
        )

        self.raw_path_artist, = self.ax.plot(
            [], [], [],
            linestyle=":",
            linewidth=1.0,
            alpha=0.30,
            label="A* voxel path"
        )

        self.a_star_artist, = self.ax.plot(
            [], [], [],
            linewidth=1.5,
            alpha=0.65,
            label="A* path"
        )

        self.final_path_artist, = self.ax.plot(
            [], [], [],
            linewidth=3.0,
            label="Final path"
        )

        self.waypoint_artist, = self.ax.plot(
            [], [], [],
            marker="o",
            markersize=4,
            linestyle="None",
            label="A* waypoints"
        )

        self.uav_artist, = self.ax.plot(
            [], [], [],
            marker="o",
            markersize=9,
            linestyle="None",
            label="UAV"
        )

        self.obstacle_artists = []

        self._create_controls()

        self.fig.canvas.mpl_connect(
            "button_press_event",
            self._on_mouse_press
        )

        self.fig.canvas.mpl_connect(
            "motion_notify_event",
            self._on_mouse_move
        )

        self.fig.canvas.mpl_connect(
            "button_release_event",
            self._on_mouse_release
        )

        self._recalculate()

    def _configure_axes(self):
        self.ax.set_xlabel("X (m)")
        self.ax.set_ylabel("Y (m)")
        self.ax.set_zlabel("Altitude Z (m)")

        self.ax.set_xlim(WORLD_BOUNDS["xmin"], WORLD_BOUNDS["xmax"])
        self.ax.set_ylim(WORLD_BOUNDS["ymin"], WORLD_BOUNDS["ymax"])
        self.ax.set_zlim(WORLD_BOUNDS["zmin"], WORLD_BOUNDS["zmax"])
        self.ax.set_box_aspect((1, 1, 1))
        self.ax.view_init(elev=25, azim=-60)
        self.ax.legend(loc="upper left")

    def _create_controls(self):
        self.start_x_slider = self._slider(
            [0.06, 0.285, 0.22, 0.025],
            "Start X",
            WORLD_BOUNDS["xmin"], WORLD_BOUNDS["xmax"],
            self.start[0], self._on_start_x
        )
        self.start_y_slider = self._slider(
            [0.06, 0.245, 0.22, 0.025],
            "Start Y",
            WORLD_BOUNDS["ymin"], WORLD_BOUNDS["ymax"],
            self.start[1], self._on_start_y
        )
        self.start_z_slider = self._slider(
            [0.06, 0.205, 0.22, 0.025],
            "Start Z",
            WORLD_BOUNDS["zmin"], WORLD_BOUNDS["zmax"],
            self.start[2], self._on_start_z
        )

        self.goal_x_slider = self._slider(
            [0.34, 0.285, 0.22, 0.025],
            "End X",
            WORLD_BOUNDS["xmin"], WORLD_BOUNDS["xmax"],
            self.goal[0], self._on_goal_x
        )
        self.goal_y_slider = self._slider(
            [0.34, 0.245, 0.22, 0.025],
            "End Y",
            WORLD_BOUNDS["ymin"], WORLD_BOUNDS["ymax"],
            self.goal[1], self._on_goal_y
        )
        self.goal_z_slider = self._slider(
            [0.34, 0.205, 0.22, 0.025],
            "End Z",
            WORLD_BOUNDS["zmin"], WORLD_BOUNDS["zmax"],
            self.goal[2], self._on_goal_z
        )

        self.safety_slider = self._slider(
            [0.62, 0.285, 0.30, 0.025],
            "Safety Margin",
            0.0, 2.0,
            self.safety_margin, self._on_safety
        )

        self.resolution_slider = self._slider(
            [0.62, 0.245, 0.30, 0.025],
            "Voxel Resolution",
            0.10, 0.50,
            self.grid_resolution, self._on_resolution,
            valstep=0.05
        )

        self.new_obs_label = self.fig.text(
            0.06, 0.202, "New obstacle:", fontsize=9
        )

        # Coordinate entry text boxes for X, Y, Base Z, Radius (R), and Height (H)
        self.new_obs_x_box = TextBox(
            self.fig.add_axes([0.06, 0.175, 0.075, 0.025]),
            "X ", initial=f"{NEW_OBSTACLE_X:.2f}"
        )
        self.new_obs_y_box = TextBox(
            self.fig.add_axes([0.145, 0.175, 0.075, 0.025]),
            "Y ", initial=f"{NEW_OBSTACLE_Y:.2f}"
        )
        self.new_obs_z_box = TextBox(
            self.fig.add_axes([0.230, 0.175, 0.075, 0.025]),
            "Z ", initial=f"{NEW_OBSTACLE_Z:.2f}"
        )
        self.new_obs_radius_box = TextBox(
            self.fig.add_axes([0.315, 0.175, 0.075, 0.025]),
            "R ", initial=f"{NEW_OBSTACLE_RADIUS:.2f}"
        )
        self.new_obs_height_box = TextBox(
            self.fig.add_axes([0.400, 0.175, 0.075, 0.025]),
            "H ", initial=f"{NEW_OBSTACLE_HEIGHT:.2f}"
        )

        ax_height = self.fig.add_axes([0.06, 0.055, 0.22, 0.115])
        self.height_radio = RadioButtons(
            ax_height,
            ["Fixed Height", "3D Height Variation"],
            active=0
        )
        self.height_radio.on_clicked(self._on_height_mode)

        ax_spline = self.fig.add_axes([0.34, 0.055, 0.22, 0.115])
        self.spline_radio = RadioButtons(
            ax_spline,
            ["No Spline", "Spline Smooth"],
            active=1
        )
        self.spline_radio.on_clicked(self._on_spline_mode)

        self._create_obstacle_selector()

        self.add_button = self._button(
            [0.62, 0.18, 0.09, 0.045], "Add", self._on_add_obstacle
        )
        self.remove_button = self._button(
            [0.72, 0.18, 0.09, 0.045], "Remove", self._on_remove_obstacle
        )
        self.reset_obstacles_button = self._button(
            [0.82, 0.18, 0.10, 0.045], "Reset Obs.", self._on_reset_obstacles
        )
        self.recalculate_button = self._button(
            [0.62, 0.125, 0.14, 0.045], "Recalculate", self._on_recalculate
        )
        self.reset_view_button = self._button(
            [0.77, 0.125, 0.15, 0.045], "Reset View", self._on_reset_view
        )
        self.animate_button = self._button(
            [0.62, 0.07, 0.14, 0.045], "Animate UAV", self._on_animate
        )
        self.export_button = self._button(
            [0.77, 0.07, 0.15, 0.045], "Export CSV", self._on_export
        )

        self.status_text = self.fig.text(
            0.06, 0.015, "", fontsize=9
        )

    def _slider(self, rect, label, minimum, maximum, value, callback, valstep=0.25):
        axis = self.fig.add_axes(rect)
        slider = Slider(axis, label, minimum, maximum, valinit=value, valstep=valstep)
        slider.on_changed(callback)
        return slider

    def _button(self, rect, label, callback):
        axis = self.fig.add_axes(rect)
        button = Button(axis, label)
        button.on_clicked(callback)
        return button

    def _create_obstacle_selector(self):
        if hasattr(self, "obstacle_selector_ax"):
            try:
                self.obstacle_selector_ax.remove()
            except Exception:
                pass

        self.obstacle_selector_ax = self.fig.add_axes([0.62, 0.055, 0.30, 0.115])
        labels = [f"O{o['id']}" for o in self.obstacles]
        if not labels:
            labels = ["No obstacles"]

        active = 0
        if (
            self.selected_obstacle_index is not None
            and self.selected_obstacle_index < len(labels)
        ):
            active = self.selected_obstacle_index

        self.obstacle_radio = RadioButtons(
            self.obstacle_selector_ax, labels, active=active
        )
        self.obstacle_radio.on_clicked(self._on_obstacle_radio)

    def _on_start_x(self, value):
        self.start[0] = value
        self._recalculate()

    def _on_start_y(self, value):
        self.start[1] = value
        self._recalculate()

    def _on_start_z(self, value):
        self.start[2] = value
        if not self.height_variation:
            self.goal[2] = value
            self.goal_z_slider.eventson = False
            self.goal_z_slider.set_val(value)
            self.goal_z_slider.eventson = True
        self._recalculate()

    def _on_goal_x(self, value):
        self.goal[0] = value
        self._recalculate()

    def _on_goal_y(self, value):
        self.goal[1] = value
        self._recalculate()

    def _on_goal_z(self, value):
        if self.height_variation:
            self.goal[2] = value
        else:
            self.goal[2] = self.start[2]
        self._recalculate()

    def _on_safety(self, value):
        self.safety_margin = value
        self._recalculate()

    def _on_resolution(self, value):
        self.grid_resolution = value
        self._recalculate()

    def _on_height_mode(self, label):
        self.height_variation = (label == "3D Height Variation")
        if not self.height_variation:
            self.goal[2] = self.start[2]
            self.goal_z_slider.eventson = False
            self.goal_z_slider.set_val(self.start[2])
            self.goal_z_slider.eventson = True
        self._recalculate()

    def _on_spline_mode(self, label):
        self.spline_enabled = (label == "Spline Smooth")
        self._recalculate()

    def _on_obstacle_radio(self, label):
        for idx, o in enumerate(self.obstacles):
            if f"O{o['id']}" == label:
                self.selected_obstacle_index = idx
                break

    def _on_add_obstacle(self, event):
        try:
            x = float(self.new_obs_x_box.text)
            y = float(self.new_obs_y_box.text)
            z = float(self.new_obs_z_box.text)
            radius = float(self.new_obs_radius_box.text)
            height = float(self.new_obs_height_box.text)
        except ValueError:
            self.status_text.set_text("Error: Invalid obstacle parameters.")
            self.fig.canvas.draw_idle()
            return

        new_id = self.next_obstacle_id
        self.next_obstacle_id += 1

        self.obstacles.append({
            "id": new_id,
            "x": x,
            "y": y,
            "base_z": z,
            "radius": max(0.1, radius),
            "height": max(0.1, height),
        })

        self.selected_obstacle_index = len(self.obstacles) - 1
        self._create_obstacle_selector()
        self._recalculate()

    def _on_remove_obstacle(self, event):
        if not self.obstacles:
            return
        if self.selected_obstacle_index is None or self.selected_obstacle_index >= len(self.obstacles):
            self.selected_obstacle_index = len(self.obstacles) - 1

        self.obstacles.pop(self.selected_obstacle_index)
        self.selected_obstacle_index = max(0, len(self.obstacles) - 1) if self.obstacles else None
        self._create_obstacle_selector()
        self._recalculate()

    def _on_reset_obstacles(self, event):
        self.obstacles = [dict(o) for o in self.original_obstacles]
        self.next_obstacle_id = max([o["id"] for o in self.obstacles], default=0) + 1
        self.selected_obstacle_index = 0 if self.obstacles else None
        self._create_obstacle_selector()
        self._recalculate()

    def _on_recalculate(self, event=None):
        self._recalculate()

    def _on_reset_view(self, event=None):
        self.ax.view_init(elev=25, azim=-60)
        self.ax.set_xlim(WORLD_BOUNDS["xmin"], WORLD_BOUNDS["xmax"])
        self.ax.set_ylim(WORLD_BOUNDS["ymin"], WORLD_BOUNDS["ymax"])
        self.ax.set_zlim(WORLD_BOUNDS["zmin"], WORLD_BOUNDS["zmax"])
        self.fig.canvas.draw_idle()

    def _on_animate(self, event=None):
        if self.final_path is None or len(self.final_path) < 2:
            self.status_text.set_text("No valid path to animate.")
            self.fig.canvas.draw_idle()
            return

        self._stop_animation()

        def update(frame):
            idx = min(frame, len(self.final_path) - 1)
            pt = self.final_path[idx]
            self.uav_artist.set_data_3d([pt[0]], [pt[1]], [pt[2]])
            return self.uav_artist,

        self.animation = FuncAnimation(
            self.fig,
            update,
            frames=len(self.final_path),
            interval=40,
            blit=False,
            repeat=True
        )
        self.fig.canvas.draw_idle()

    def _on_export(self, event=None):
        if self.final_path is None:
            self.status_text.set_text("No path available to export.")
            self.fig.canvas.draw_idle()
            return

        os.makedirs("exports", exist_ok=True)
        filename = f"exports/path_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        try:
            with open(filename, mode="w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["x", "y", "z"])
                for pt in self.final_path:
                    writer.writerow(list(pt))
            self.status_text.set_text(f"Path exported to {filename}")
        except Exception as e:
            self.status_text.set_text(f"Export failed: {e}")
        self.fig.canvas.draw_idle()

    def _stop_animation(self):
        if self.animation is not None:
            try:
                self.animation.event_source.stop()
            except Exception:
                pass
            self.animation = None
        self.uav_artist.set_data_3d([], [], [])

    def _on_mouse_press(self, event):
        pass

    def _on_mouse_move(self, event):
        pass

    def _on_mouse_release(self, event):
        pass

    def _create_planner(self):
        self.planner = AStar3DPlanner(
            start=self.start,
            goal=self.goal,
            obstacles=self.obstacles,
            world_bounds=WORLD_BOUNDS,
            resolution=self.grid_resolution,
            safety_margin=self.safety_margin,
            allow_height_variation=self.height_variation
        )

    def _recalculate(self, event=None):
        self._stop_animation()
        self._create_planner()

        try:
            self.a_star_path = self.planner.solve()
            self.raw_path = self.planner.raw_path

            if self.a_star_path is None:
                self.final_path = None
                self.status_text.set_text("Status: No path found.")
            else:
                if self.spline_enabled:
                    smoother = SplineSmoother(self.planner)
                    self.final_path = smoother.smooth(self.a_star_path)
                else:
                    self.final_path = self.a_star_path.copy()
                self.status_text.set_text("Status: Path computed successfully.")
        except Exception as e:
            self.a_star_path = None
            self.raw_path = None
            self.final_path = None
            self.status_text.set_text(f"Status: Error - {e}")

        self._draw_obstacles()
        self._update_artists()
        self.fig.canvas.draw_idle()

    def _draw_obstacles(self):
        for artist in self.obstacle_artists:
            try:
                artist.remove()
            except Exception:
                pass
        self.obstacle_artists = []

        for o in self.obstacles:
            cx = float(o["x"])
            cy = float(o["y"])
            r = float(o["radius"])
            h = float(o["height"])
            base_z = float(o.get("base_z", 0.0))

            theta = np.linspace(0, 2 * np.pi, 20)
            z_vals = np.linspace(base_z, base_z + h, 10)
            Theta, Z = np.meshgrid(theta, z_vals)
            X = cx + r * np.cos(Theta)
            Y = cy + r * np.sin(Theta)

            ax3d = self.ax
            surf = ax3d.plot_surface(X, Y, Z, color="orange", alpha=0.4, edgecolor="none")
            self.obstacle_artists.append(surf)

    def _update_artists(self):
        self.start_artist.set_data_3d([self.start[0]], [self.start[1]], [self.start[2]])
        self.goal_artist.set_data_3d([self.goal[0]], [self.goal[1]], [self.goal[2]])

        if self.raw_path is not None and len(self.raw_path) > 0:
            self.raw_path_artist.set_data_3d(self.raw_path[:, 0], self.raw_path[:, 1], self.raw_path[:, 2])
        else:
            self.raw_path_artist.set_data_3d([], [], [])

        if self.a_star_path is not None and len(self.a_star_path) > 0:
            self.a_star_artist.set_data_3d(self.a_star_path[:, 0], self.a_star_path[:, 1], self.a_star_path[:, 2])
            self.waypoint_artist.set_data_3d(self.a_star_path[:, 0], self.a_star_path[:, 1], self.a_star_path[:, 2])
        else:
            self.a_star_artist.set_data_3d([], [], [])
            self.waypoint_artist.set_data_3d([], [], [])

        if self.final_path is not None and len(self.final_path) > 0:
            self.final_path_artist.set_data_3d(self.final_path[:, 0], self.final_path[:, 1], self.final_path[:, 2])
        else:
            self.final_path_artist.set_data_3d([], [], [])


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    gui = AvoidanceGUI()
    plt.show()