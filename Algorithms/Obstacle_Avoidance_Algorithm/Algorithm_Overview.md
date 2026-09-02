# PHASE — RYNTARA Integration

## Overview

This directory contains a **derived version of PHASE (Physics-based Hierarchical Adaptive Spatial Evasion)** integrated into the **RYNTARA** fleet management and autonomous trajectory coordination system.

The implementation is based on the research version of PHASE, but has been adapted to operate within RYNTARA's system architecture, data flow, vehicle model, and runtime requirements.

> **This is a derived system implementation of PHASE. It is not the canonical research implementation.**

The original research implementation is maintained separately in the dedicated algorithms repository.

---

## Relationship to PHASE

**PHASE** was developed as a standalone research framework for hierarchical multi-agent trajectory coordination.

RYNTARA incorporates a derived implementation of PHASE as part of its autonomous fleet coordination pipeline.

```text
                    PHASE
      Research / Reference Implementation
                       │
                       │ Derived & Adapted
                       ▼
              RYNTARA Integration
                       │
                       ▼
          Fleet Management System
```

The RYNTARA implementation may differ from the research implementation in terms of:

* System interfaces
* Vehicle and fleet data models
* Runtime execution
* Input/output representations
* Integration with other RYNTARA services
* Visualization
* Communication mechanisms
* Configuration
* Performance optimizations
* System-specific constraints

These changes are intended to support integration into the larger RYNTARA platform.

---

## PHASE Architecture

The underlying PHASE coordination approach uses a hierarchical resolution strategy:

```text
                Vehicle Intent
                     │
                     ▼
             Localized A* Planning
                     │
                     ▼
              Conflict Detection
                     │
              Conflict Event
                     ▼
          Priority-Weighted Evasion
                     │
                     ▼
          Geometric Constraint
               Resolution
                     │
                     ▼
                State Commit
                     │
                     ▼
                 Replanning
```

The core principle is to avoid treating every interaction as a complete global planning problem.

Instead, computational effort is escalated according to the severity and state of the interaction.

---

## RYNTARA Integration

Within RYNTARA, the derived PHASE implementation acts as a trajectory coordination and conflict-resolution component.

Conceptually:

```text
                    RYNTARA
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
     Fleet Data     Environment     Mission
        │              │              │
        └──────────────┼──────────────┘
                       ▼
               PHASE Integration
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
      Local A*     Evasion      Constraint
      Planning     Layer        Resolution
          │            │            │
          └────────────┼────────────┘
                       ▼
              Resolved Trajectory
                       │
                       ▼
                RYNTARA System
```

This allows PHASE to operate as part of the broader RYNTARA fleet-management architecture rather than as an isolated simulation.

---

## Core Components

### Localized Planning

A* is used as the deliberative planning mechanism.

The planner can restrict dynamic-agent consideration to a configurable local planning region, reducing the planning problem presented to each vehicle.

### Conflict Detection

Vehicle interactions are monitored using configurable safety margins and separation constraints.

When a potential conflict reaches the defined threshold, the reactive coordination mechanism is activated.

### Priority-Weighted Evasion

Vehicles can perform lateral evasive maneuvers based on:

* Current heading
* Conflict geometry
* Opposing vehicle motion
* Goal direction
* Nearby obstacle influence
* Vehicle priority
* Vehicle velocity

A priority-weighted mobility coefficient is used to influence the interaction:

```text
Wᵢ = Pᵢ × Vᵢ
```

where:

* `Pᵢ` = vehicle priority
* `Vᵢ` = vehicle velocity
* `Wᵢ` = priority-weighted mobility coefficient

### Constraint Resolution

An iterative geometric correction stage can resolve residual overlaps resulting from discrete trajectory updates and simultaneous interactions.

This layer operates as a constraint-correction mechanism rather than replacing the underlying trajectory planner.

---

## Difference From the Research Version

The implementation in this directory should be considered a **system-derived implementation**.

Changes made here should primarily address RYNTARA integration requirements.

```text
PHASE Research Repository
        │
        │ Reference Algorithm
        │
        ▼
RYNTARA Derived Implementation
        │
        ├── System Interfaces
        ├── Fleet Management
        ├── Runtime Integration
        ├── RYNTARA Data Models
        └── Application-Specific Extensions
```

Experimental changes that modify the fundamental PHASE algorithm should preferably be implemented and documented in the standalone research repository first.

---

## Research Reference

The canonical research implementation of PHASE is maintained separately.

**PHASE — Physics-based Hierarchical Adaptive Spatial Evasion**

DOI:

**10.5281/zenodo.22260336**

The RYNTARA implementation is derived from this research artifact and should not be treated as an independent publication of the algorithm.

---

## Status

**Status:** Integrated / Derived Implementation

This implementation is maintained as part of the RYNTARA system and may evolve as the surrounding fleet-management architecture develops.

The standalone PHASE repository remains the reference implementation for research, experimentation, benchmarking, and versioned releases.

---

## Disclaimer

This implementation is intended for research and system-development purposes.

Integration into RYNTARA does not imply formal guarantees of collision-free operation, real-world safety, or suitability for deployment without additional validation, realistic vehicle dynamics, uncertainty modelling, and formal safety analysis.
