# KDT Aso

**Autonomous Operations Platform**

Knight Division Tactical

---

## Overview

KDT Aso is an autonomous AI operations platform that runs operations, coordinates assets, processes intelligence, and executes tasks without dependence on foreign cloud infrastructure.

Named after **Aso Rock**, Nigeria's seat of power.

## Architecture

```
KDT Aso
├── Agents (Your Staff)
│   ├── KDT Hero (Intelligence Branch)
│   │   ├── Intelligence Officer
│   │   ├── Intel Analyst
│   │   └── Collection Manager
│   ├── Operations Section
│   │   ├── Operations Officer
│   │   └── Watch Officer
│   ├── Geospatial Section
│   │   └── Geospatial Officer
│   ├── Surveillance Section
│   │   └── Surveillance Officer
│   ├── Communications Section
│   │   └── Communications Officer
│   ├── Logistics Section
│   │   └── Logistics Officer
│   └── Admin Section
│       └── Admin Officer
├── Core Engine
│   ├── Agent Router
│   ├── Standing Orders
│   └── Operator Manager
└── Dashboard (React)
```

## Key Concepts

- **Operator**: The human user. Commands the system.
- **Agents**: AI staff members organized by role. Talk to them like people.
- **KDT Hero**: The intelligence technology brand. All intel functions.
- **Standing Orders**: Pre-authorized automated responses.
- **Authority Levels**: What agents can do autonomously vs. what requires approval.

## Quick Start

```bash
# Install dependencies
npm install

# Start the core server
npm start

# In another terminal, start the dashboard
npm run dashboard
```

## API

- `GET /api/status` - System status
- `POST /api/message` - Send message to agents
- `GET /api/agents` - List all agents and status
- `GET /api/standing-orders` - List standing orders

## Configuration

- `config/system.yaml` - Main system configuration
- `config/standing_orders.yaml` - Automated responses
- `config/operators/` - Operator profiles

## Agents

Each agent has a SOUL.md defining their:
- Identity and role
- Personality and communication style
- Authority levels
- Coordination patterns

Agents are located in `agents/<section>/<role>/SOUL.md`.

## Standing Orders

Pre-authorized responses to events. Define:
- Trigger conditions
- Authority level required
- Actions to execute
- Escalation thresholds

## License

PROPRIETARY - Knight Division Tactical

---

*KDT Aso drives itself.*
