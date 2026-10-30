/**
 * ==============================================================================
 * PARKEASE - Facility Parking Guidance & Optimization Engine
 * ==============================================================================
 * Clean, production-grade implementation of real-time parking space routing.
 * Modules:
 *  1. Configuration & Landmark Data
 *  2. Directed Road Graph Network
 *  3. Facility Layout & Stall Management (62 bays across Zones A, B, C)
 *  4. A* (A-Star) Lane Pathfinding Algorithm
 *  5. Multi-Criteria Space Scoring Engine
 *  6. Facility Traffic & Occupancy Simulation
 *  7. Clean Vector Map Renderer & Vehicle Motion
 *  8. Minimal Tactile Audio Engine (Subtle UI Feedback)
 *  9. Application Controller & DOM Interaction
 * ==============================================================================
 */

'use strict';

/* ==============================================================================
   SECTION 1: CONFIGURATION & CONSTANTS
   ============================================================================== */

const CONFIG = {
  CANVAS_WIDTH: 1140,
  CANVAS_HEIGHT: 730,
  TOTAL_SLOTS: 62,
  BASE_TICK_RATE_MS: 2400,

  // Evaluation weights for multi-objective scoring
  // score = w1*walkDist + w2*driveDist + w3*congestion + w4*exitProximity + w5*typePenalty
  DEFAULT_WEIGHTS: {
    walking: 0.80,    // w1: Weight for walking distance
    congestion: 0.60, // w3: Weight for zone congestion / traffic
    exit: 0.40,       // w4: Weight for exit proximity
    driving: 0.50,    // w2: Weight for driving distance from entry
    typeMatch: 1.00   // w5: Enforcement penalty for vehicle compatibility
  },

  // Architectural Landmarks & Gate Coordinates
  LANDMARKS: {
    main_entrance: {
      id: 'main_entrance',
      name: 'Main Lobby Entrance',
      subtitle: 'Plaza Tower Core',
      x: 570,
      y: 45,
      type: 'building'
    },
    elevator: {
      id: 'elevator',
      name: 'Elevator Core A',
      subtitle: 'West Tower Access',
      x: 100,
      y: 45,
      type: 'elevator'
    },
    mall_gate: {
      id: 'mall_gate',
      name: 'Retail Concourse',
      subtitle: 'East Mall Gate',
      x: 1040,
      y: 45,
      type: 'mall'
    },
    entry_gate: {
      id: 'entry_gate',
      name: 'North Entry Gate',
      subtitle: 'RFID Barrier 1',
      x: 50,
      y: 675,
      type: 'gate'
    },
    exit_gate: {
      id: 'exit_gate',
      name: 'Express Exit Gate',
      subtitle: 'Automated Departure',
      x: 1090,
      y: 675,
      type: 'gate'
    }
  },

  // Natural palette for parked vehicles (matte automotive finishes)
  CAR_COLORS: [
    { body: '#334155', glass: '#0f172a', name: 'Slate Grey' },
    { body: '#e2e8f0', glass: '#1e293b', name: 'Pearl White' },
    { body: '#1e293b', glass: '#020617', name: 'Obsidian Black' },
    { body: '#0369a1', glass: '#082f49', name: 'Deep Navy' },
    { body: '#991b1b', glass: '#450a0a', name: 'Burgundy' },
    { body: '#065f46', glass: '#022c22', name: 'British Racing Green' },
    { body: '#475569', glass: '#0f172a', name: 'Graphite' },
    { body: '#b45309', glass: '#451a03', name: 'Bronze' }
  ]
};

/* ==============================================================================
   SECTION 2: DIRECTED ROAD GRAPH NETWORK
   ============================================================================== */

class RoadGraph {
  constructor() {
    this.nodes = {};
    this.edges = {};
    this.initNetwork();
  }

  addNode(id, x, y) {
    this.nodes[id] = { x, y };
    if (!this.edges[id]) this.edges[id] = [];
  }

  addEdge(from, to, bidirectional = false) {
    if (!this.nodes[from] || !this.nodes[to]) return;
    const p1 = this.nodes[from];
    const p2 = this.nodes[to];
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    this.edges[from].push({ to, cost: dist });
    if (bidirectional) {
      if (!this.edges[to]) this.edges[to] = [];
      this.edges[to].push({ to: from, cost: dist });
    }
  }

  initNetwork() {
    // Gates
    this.addNode('N_ENTRY', 50, 675);
    this.addNode('N_EXIT', 1090, 675);

    // West Perimeter Lane (Northbound)
    this.addNode('N_W_BOT', 50, 600);
    this.addNode('N_W_MID_S', 50, 480);
    this.addNode('N_W_MID_N', 50, 360);
    this.addNode('N_W_TOP', 50, 195);
    this.addNode('N_W_CORNER', 50, 105);

    // Top Perimeter Lane (Eastbound)
    this.addNode('N_TOP_W', 100, 105);
    this.addNode('N_TOP_MID_W', 330, 105);
    this.addNode('N_TOP_CENTER', 570, 105);
    this.addNode('N_TOP_MID_E', 810, 105);
    this.addNode('N_TOP_E', 1040, 105);
    this.addNode('N_TOP_CORNER', 1090, 105);

    // East Perimeter Lane (Southbound to Exit)
    this.addNode('N_E_TOP', 1090, 195);
    this.addNode('N_E_MID_N', 1090, 360);
    this.addNode('N_E_MID_S', 1090, 480);
    this.addNode('N_E_BOT', 1090, 600);

    // Bottom Lane
    this.addNode('N_BOT_W', 150, 675);
    this.addNode('N_BOT_MID_W', 400, 675);
    this.addNode('N_BOT_MID_E', 750, 675);
    this.addNode('N_BOT_E', 980, 675);

    // Internal Aisles
    // Aisle A (y = 195)
    this.addNode('N_AISLE_A_W', 100, 195);
    this.addNode('N_AISLE_A_MID_W', 340, 195);
    this.addNode('N_AISLE_A_CENTER', 570, 195);
    this.addNode('N_AISLE_A_MID_E', 800, 195);
    this.addNode('N_AISLE_A_E', 1040, 195);

    // Cross Aisle (y = 295)
    this.addNode('N_CROSS_AB_W', 50, 295);
    this.addNode('N_CROSS_AB_CENTER', 570, 295);
    this.addNode('N_CROSS_AB_E', 1090, 295);

    // Aisle B (y = 390)
    this.addNode('N_AISLE_B_W', 100, 390);
    this.addNode('N_AISLE_B_MID_W', 340, 390);
    this.addNode('N_AISLE_B_CENTER', 570, 390);
    this.addNode('N_AISLE_B_MID_E', 800, 390);
    this.addNode('N_AISLE_B_E', 1040, 390);

    // Aisle C (y = 580)
    this.addNode('N_AISLE_C_W', 100, 580);
    this.addNode('N_AISLE_C_MID_W', 340, 580);
    this.addNode('N_AISLE_C_CENTER', 570, 580);
    this.addNode('N_AISLE_C_MID_E', 800, 580);
    this.addNode('N_AISLE_C_E', 1040, 580);

    // Network Connections
    this.addEdge('N_ENTRY', 'N_W_BOT');
    this.addEdge('N_W_BOT', 'N_W_MID_S');
    this.addEdge('N_W_MID_S', 'N_W_MID_N');
    this.addEdge('N_W_MID_N', 'N_W_TOP');
    this.addEdge('N_W_TOP', 'N_W_CORNER');

    this.addEdge('N_W_CORNER', 'N_TOP_W');
    this.addEdge('N_TOP_W', 'N_TOP_MID_W');
    this.addEdge('N_TOP_MID_W', 'N_TOP_CENTER');
    this.addEdge('N_TOP_CENTER', 'N_TOP_MID_E');
    this.addEdge('N_TOP_MID_E', 'N_TOP_E');
    this.addEdge('N_TOP_E', 'N_TOP_CORNER');

    this.addEdge('N_TOP_CORNER', 'N_E_TOP');
    this.addEdge('N_E_TOP', 'N_E_MID_N');
    this.addEdge('N_E_MID_N', 'N_E_MID_S');
    this.addEdge('N_E_MID_S', 'N_E_BOT');
    this.addEdge('N_E_BOT', 'N_EXIT');

    this.addEdge('N_ENTRY', 'N_BOT_W');
    this.addEdge('N_BOT_W', 'N_BOT_MID_W');
    this.addEdge('N_BOT_MID_W', 'N_BOT_MID_E');
    this.addEdge('N_BOT_MID_E', 'N_BOT_E');
    this.addEdge('N_BOT_E', 'N_EXIT');

    this.addEdge('N_W_TOP', 'N_AISLE_A_W');
    this.addEdge('N_AISLE_A_W', 'N_AISLE_A_MID_W');
    this.addEdge('N_AISLE_A_MID_W', 'N_AISLE_A_CENTER');
    this.addEdge('N_AISLE_A_CENTER', 'N_AISLE_A_MID_E');
    this.addEdge('N_AISLE_A_MID_E', 'N_AISLE_A_E');
    this.addEdge('N_AISLE_A_E', 'N_E_TOP');

    this.addEdge('N_W_MID_N', 'N_AISLE_B_W', true);
    this.addEdge('N_AISLE_B_W', 'N_AISLE_B_MID_W', true);
    this.addEdge('N_AISLE_B_MID_W', 'N_AISLE_B_CENTER', true);
    this.addEdge('N_AISLE_B_CENTER', 'N_AISLE_B_MID_E', true);
    this.addEdge('N_AISLE_B_MID_E', 'N_AISLE_B_E', true);
    this.addEdge('N_AISLE_B_E', 'N_E_MID_N', true);

    this.addEdge('N_W_BOT', 'N_AISLE_C_W');
    this.addEdge('N_AISLE_C_W', 'N_AISLE_C_MID_W');
    this.addEdge('N_AISLE_C_MID_W', 'N_AISLE_C_CENTER');
    this.addEdge('N_AISLE_C_CENTER', 'N_AISLE_C_MID_E');
    this.addEdge('N_AISLE_C_MID_E', 'N_AISLE_C_E');
    this.addEdge('N_AISLE_C_E', 'N_E_BOT');

    this.addEdge('N_TOP_CENTER', 'N_AISLE_A_CENTER', true);
    this.addEdge('N_AISLE_A_CENTER', 'N_CROSS_AB_CENTER', true);
    this.addEdge('N_CROSS_AB_CENTER', 'N_AISLE_B_CENTER', true);
    this.addEdge('N_AISLE_B_CENTER', 'N_AISLE_C_CENTER', true);
    this.addEdge('N_AISLE_C_CENTER', 'N_BOT_MID_W', true);
  }
}

/* ==============================================================================
   SECTION 3: PARKING LOT DATA & STALL LAYOUT
   ============================================================================== */

class ParkingLot {
  constructor(roadGraph) {
    this.graph = roadGraph;
    this.slots = [];
    this.slotsById = {};
    this.generateLayout();
    this.linkSlotsToRoadGraph();
    this.precomputeDistances();
  }

  generateLayout() {
    const slots = [];

    const createRow = (zone, prefix, startIdx, count, startX, stepX, y, rowOrientation, typeMap) => {
      for (let i = 0; i < count; i++) {
        const num = startIdx + i;
        const id = `${prefix}-${String(num).padStart(2, '0')}`;
        const x = startX + i * stepX;
        const type = typeMap(num);

        slots.push({
          id,
          zone,
          type,
          status: 'available',
          x,
          y,
          width: 44,
          height: 60,
          orientation: rowOrientation,
          car: null,
          reservation: null,
          distances: {}
        });
      }
    };

    // Zone A: 20 slots (Row A1: 10, Row A2: 10)
    createRow('A', 'A', 1, 10, 115, 92, 125, 'south_facing', (n) => {
      if (n <= 4) return 'ev';
      if (n <= 8) return 'disabled';
      return 'regular';
    });

    createRow('A', 'A', 11, 10, 115, 92, 205, 'north_facing', (n) => {
      if (n <= 14) return 'ev';
      return 'regular';
    });

    // Zone B: 22 slots (Row B1: 11, Row B2: 11)
    createRow('B', 'B', 1, 11, 105, 84, 320, 'south_facing', (n) => {
      if (n <= 4) return 'compact';
      return 'regular';
    });

    createRow('B', 'B', 12, 11, 105, 84, 400, 'north_facing', (n) => {
      if (n <= 15) return 'compact';
      return 'regular';
    });

    // Zone C: 20 slots (Row C1: 10, Row C2: 10)
    createRow('C', 'C', 1, 10, 115, 92, 510, 'south_facing', (n) => {
      if (n <= 2) return 'ev';
      if (n <= 4) return 'compact';
      return 'regular';
    });

    createRow('C', 'C', 11, 10, 115, 92, 590, 'north_facing', () => 'regular');

    this.slots = slots;
    this.slots.forEach(s => { this.slotsById[s.id] = s; });
  }

  linkSlotsToRoadGraph() {
    this.slots.forEach(slot => {
      const centerX = slot.x + slot.width / 2;
      let accessY = slot.zone === 'A' ? 195 : slot.zone === 'B' ? 390 : 580;

      const accessNodeId = `N_ACCESS_${slot.id}`;
      this.graph.addNode(accessNodeId, centerX, accessY);

      let leftNode = null;
      let rightNode = null;
      let minLeftDist = Infinity;
      let minRightDist = Infinity;

      for (const [nodeId, pt] of Object.entries(this.graph.nodes)) {
        if (nodeId.startsWith('N_AISLE_') && Math.abs(pt.y - accessY) < 10) {
          if (pt.x <= centerX && (centerX - pt.x) < minLeftDist) {
            minLeftDist = centerX - pt.x;
            leftNode = nodeId;
          }
          if (pt.x >= centerX && (pt.x - centerX) < minRightDist) {
            minRightDist = pt.x - centerX;
            rightNode = nodeId;
          }
        }
      }

      if (leftNode) this.graph.addEdge(leftNode, accessNodeId, true);
      if (rightNode) this.graph.addEdge(accessNodeId, rightNode, true);

      slot.accessNodeId = accessNodeId;
      slot.accessPoint = { x: centerX, y: accessY };
      slot.centerPoint = { x: centerX, y: slot.y + slot.height / 2 };
    });
  }

  precomputeDistances() {
    const PIXELS_PER_METER = 10;

    this.slots.forEach(slot => {
      const cx = slot.centerPoint.x;
      const cy = slot.centerPoint.y;

      Object.entries(CONFIG.LANDMARKS).forEach(([key, lm]) => {
        const directDist = Math.hypot(lm.x - cx, lm.y - cy);
        slot.distances[key] = Math.round((directDist * 1.15) / PIXELS_PER_METER);
      });

      const distFromEntry = (Math.abs(cx - CONFIG.LANDMARKS.entry_gate.x) + Math.abs(cy - CONFIG.LANDMARKS.entry_gate.y)) / PIXELS_PER_METER;
      const distToExit = (Math.abs(cx - CONFIG.LANDMARKS.exit_gate.x) + Math.abs(cy - CONFIG.LANDMARKS.exit_gate.y)) / PIXELS_PER_METER;

      slot.distances.driveFromEntry = Math.round(distFromEntry);
      slot.distances.driveToExit = Math.round(distToExit);
    });
  }

  getZoneStats(zoneLetter) {
    const zoneSlots = this.slots.filter(s => s.zone === zoneLetter);
    const occupied = zoneSlots.filter(s => s.status === 'occupied').length;
    const reserved = zoneSlots.filter(s => s.status === 'reserved').length;
    const available = zoneSlots.length - occupied - reserved;
    const occupancyRate = zoneSlots.length > 0 ? (occupied + reserved) / zoneSlots.length : 0;

    return {
      total: zoneSlots.length,
      occupied,
      reserved,
      available,
      occupancyRate
    };
  }

  getGlobalStats() {
    const occupied = this.slots.filter(s => s.status === 'occupied').length;
    const reserved = this.slots.filter(s => s.status === 'reserved').length;
    const available = this.slots.length - occupied - reserved;
    const occupancyPercent = Math.round(((occupied + reserved) / this.slots.length) * 100);

    return {
      total: this.slots.length,
      available,
      occupied,
      reserved,
      occupancyPercent
    };
  }
}

/* ==============================================================================
   SECTION 4: A* PATHFINDING ALGORITHM
   ============================================================================== */

class AStarPathfinder {
  constructor(roadGraph) {
    this.graph = roadGraph;
  }

  findPath(startNodeId, goalNodeId) {
    const nodes = this.graph.nodes;
    const edges = this.graph.edges;

    if (!nodes[startNodeId] || !nodes[goalNodeId]) return [];

    const goalPt = nodes[goalNodeId];
    const openSet = new Set([startNodeId]);
    const cameFrom = {};

    const gScore = {};
    Object.keys(nodes).forEach(id => { gScore[id] = Infinity; });
    gScore[startNodeId] = 0;

    const fScore = {};
    Object.keys(nodes).forEach(id => { fScore[id] = Infinity; });
    fScore[startNodeId] = this.heuristic(nodes[startNodeId], goalPt);

    while (openSet.size > 0) {
      let current = null;
      let lowestF = Infinity;
      for (const nodeId of openSet) {
        if (fScore[nodeId] < lowestF) {
          lowestF = fScore[nodeId];
          current = nodeId;
        }
      }

      if (current === goalNodeId) {
        return this.reconstructPath(cameFrom, current);
      }

      openSet.delete(current);

      const neighbors = edges[current] || [];
      for (const edge of neighbors) {
        const neighbor = edge.to;
        const tentativeGScore = gScore[current] + edge.cost;

        if (tentativeGScore < gScore[neighbor]) {
          cameFrom[neighbor] = current;
          gScore[neighbor] = tentativeGScore;
          fScore[neighbor] = tentativeGScore + this.heuristic(nodes[neighbor], goalPt);
          openSet.add(neighbor);
        }
      }
    }

    return [];
  }

  heuristic(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  reconstructPath(cameFrom, current) {
    const path = [this.graph.nodes[current]];
    while (cameFrom[current]) {
      current = cameFrom[current];
      path.unshift(this.graph.nodes[current]);
    }
    return path;
  }
}

/* ==============================================================================
   SECTION 5: MULTI-CRITERIA SCORING ENGINE
   ============================================================================== */

class AIScoringEngine {
  constructor(lot) {
    this.lot = lot;
  }

  evaluate(preferences) {
    const { destination, vehicleType, weights } = preferences;
    const candidates = this.lot.slots.filter(s => s.status === 'available');

    if (candidates.length === 0) {
      return { topPick: null, alternatives: [], allScores: [] };
    }

    const zoneCongestion = {
      A: this.lot.getZoneStats('A').occupancyRate,
      B: this.lot.getZoneStats('B').occupancyRate,
      C: this.lot.getZoneStats('C').occupancyRate
    };

    const MAX_WALK = 110;
    const MAX_DRIVE = 180;
    const MAX_EXIT = 160;

    const wWalk = (weights.walking ?? 80) / 100;
    const wDrive = (weights.driving ?? 50) / 100;
    const wCongestion = (weights.congestion ?? 60) / 100;
    const wExit = (weights.exit ?? 40) / 100;
    const wTypePenalty = 1.0;

    const scoredSlots = candidates.map(slot => {
      const walkMeters = slot.distances[destination] || 50;
      const normWalk = Math.min(walkMeters / MAX_WALK, 1.0);

      const driveMeters = slot.distances.driveFromEntry || 60;
      const normDrive = Math.min(driveMeters / MAX_DRIVE, 1.0);

      const normCongestion = zoneCongestion[slot.zone] || 0.5;

      const exitMeters = slot.distances.driveToExit || 70;
      const normExit = Math.min(exitMeters / MAX_EXIT, 1.0);

      const normTypePenalty = this.calculateTypePenalty(vehicleType, slot.type);

      const rawScore = (wWalk * normWalk) +
                       (wDrive * normDrive) +
                       (wCongestion * normCongestion) +
                       (wExit * normExit) +
                       (wTypePenalty * normTypePenalty);

      const maxPossibleScore = wWalk + wDrive + wCongestion + wExit + wTypePenalty;
      const matchScorePercent = Math.max(5, Math.round((1 - (rawScore / maxPossibleScore)) * 100));

      const breakdown = {
        walkScore: Math.round((1 - normWalk) * 100),
        walkMeters,
        driveScore: Math.round((1 - normDrive) * 100),
        driveMeters,
        flowScore: Math.round((1 - normCongestion) * 100),
        congestionRate: Math.round(normCongestion * 100),
        exitScore: Math.round((1 - normExit) * 100),
        exitMeters,
        typeScore: Math.round((1 - normTypePenalty) * 100),
        typePenalty: normTypePenalty
      };

      return {
        slot,
        rawScore,
        matchScorePercent,
        breakdown
      };
    });

    scoredSlots.sort((a, b) => a.rawScore - b.rawScore);

    const topPick = scoredSlots[0] || null;
    const alternatives = scoredSlots.slice(1, 4);

    if (topPick) {
      topPick.reasoning = this.generateReasoningText(topPick, preferences);
    }

    return {
      topPick,
      alternatives,
      allScores: scoredSlots
    };
  }

  calculateTypePenalty(userVehicle, slotType) {
    if (userVehicle === 'ev') {
      if (slotType === 'ev') return 0.0;
      if (slotType === 'regular') return 0.45;
      if (slotType === 'compact') return 0.55;
      if (slotType === 'disabled') return 0.90;
    }

    if (userVehicle === 'disabled') {
      if (slotType === 'disabled') return 0.0;
      if (slotType === 'regular') return 0.70;
      if (slotType === 'ev') return 0.75;
      if (slotType === 'compact') return 0.85;
    }

    if (userVehicle === 'compact') {
      if (slotType === 'compact') return 0.0;
      if (slotType === 'regular') return 0.15;
      if (slotType === 'ev') return 0.65;
      if (slotType === 'disabled') return 0.90;
    }

    if (userVehicle === 'regular') {
      if (slotType === 'regular') return 0.0;
      if (slotType === 'compact') return 0.55;
      if (slotType === 'ev') return 0.60;
      if (slotType === 'disabled') return 0.95;
    }

    return 0.2;
  }

  generateReasoningText(pick, preferences) {
    const { slot, breakdown, matchScorePercent } = pick;
    const destName = CONFIG.LANDMARKS[preferences.destination]?.name || 'destination';
    const zoneName = `Zone ${slot.zone}`;

    const parts = [];

    // Walking analysis
    parts.push(`located ${breakdown.walkMeters} meters from ${destName}`);

    // Vehicle compatibility
    if (preferences.vehicleType === 'ev' && slot.type === 'ev') {
      parts.push(`equipped with a Level-2 EV charging station`);
    } else if (preferences.vehicleType === 'disabled' && slot.type === 'disabled') {
      parts.push(`equipped with wide ADA accessibility corridors`);
    } else if (preferences.vehicleType === 'compact' && slot.type === 'compact') {
      parts.push(`sized for compact parking`);
    }

    // Traffic condition
    if (breakdown.congestionRate <= 50) {
      parts.push(`${zoneName} currently has low traffic (${breakdown.congestionRate}% occupied)`);
    } else {
      parts.push(`steady traffic in ${zoneName}`);
    }

    return `Slot ${slot.id} has a ${matchScorePercent}% match rating. It is ${parts.join(', ')}, ensuring quick parking and a minimal walk.`;
  }
}

/* ==============================================================================
   SECTION 6: FACILITY SIMULATION ENGINE
   ============================================================================== */

class SimulationEngine {
  constructor(parkingLot, onUpdateCallback) {
    this.lot = parkingLot;
    this.onUpdate = onUpdateCallback;
    this.isRunning = true;
    this.speedMultiplier = 1.0;
    this.timerId = null;

    this.initializeOccupancy();
    this.start();
  }

  initializeOccupancy() {
    this.lot.slots.forEach(slot => {
      // Keep key spots open initially for immediate testing
      if (slot.id === 'A-02' || slot.id === 'A-06' || slot.id === 'B-03') {
        slot.status = 'available';
        return;
      }

      if (Math.random() < 0.56) {
        slot.status = 'occupied';
        slot.car = this.getRandomCar();
      } else {
        slot.status = 'available';
        slot.car = null;
      }
    });
  }

  getRandomCar() {
    const c = CONFIG.CAR_COLORS[Math.floor(Math.random() * CONFIG.CAR_COLORS.length)];
    return {
      color: c.body,
      glassColor: c.glass,
      name: c.name,
      arrivedAt: Date.now() - Math.floor(Math.random() * 3600000)
    };
  }

  start() {
    this.isRunning = true;
    this.scheduleNextTick();
  }

  pause() {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
    if (this.isRunning) {
      this.pause();
      this.start();
    }
  }

  scheduleNextTick() {
    if (!this.isRunning) return;
    const interval = Math.max(400, CONFIG.BASE_TICK_RATE_MS / this.speedMultiplier);
    this.timerId = setTimeout(() => {
      this.step();
      this.scheduleNextTick();
    }, interval);
  }

  step() {
    const occupied = this.lot.slots.filter(s => s.status === 'occupied');
    const available = this.lot.slots.filter(s => s.status === 'available' && !s.isUserSelected);

    // Natural departures
    if (occupied.length > 8 && Math.random() < 0.45) {
      const departing = occupied[Math.floor(Math.random() * occupied.length)];
      departing.status = 'available';
      departing.car = null;
    }

    // Natural arrivals
    if (available.length > 5 && Math.random() < 0.48) {
      const arriving = available[Math.floor(Math.random() * available.length)];
      arriving.status = 'occupied';
      arriving.car = this.getRandomCar();
    }

    if (this.onUpdate) {
      this.onUpdate({ type: 'tick' });
    }
  }

  triggerRushHour(onComplete) {
    let count = 0;
    const fillInterval = setInterval(() => {
      const available = this.lot.slots.filter(s => s.status === 'available' && !s.isUserSelected);
      const currentRate = (this.lot.slots.length - available.length) / this.lot.slots.length;

      if (currentRate >= 0.90 || available.length <= 4 || count > 20) {
        clearInterval(fillInterval);
        if (onComplete) onComplete();
        return;
      }

      for (let i = 0; i < 2 && available.length > 0; i++) {
        const slot = available.pop();
        slot.status = 'occupied';
        slot.car = this.getRandomCar();
      }

      count++;
      if (this.onUpdate) this.onUpdate({ type: 'rush_step' });
    }, 110);
  }
}

/* ==============================================================================
   SECTION 7: CLEAN VECTOR MAP RENDERER
   ============================================================================== */

class MapRenderer {
  constructor(svgElement, parkingLot) {
    this.svg = svgElement;
    this.lot = parkingLot;

    this.layerGround = this.svg.getElementById('layer-ground');
    this.layerLanes = this.svg.getElementById('layer-lanes');
    this.layerSlots = this.svg.getElementById('layer-slots');
    this.layerCars = this.svg.getElementById('layer-cars');
    this.layerRoutes = this.svg.getElementById('layer-routes');
    this.layerLandmarks = this.svg.getElementById('layer-landmarks');

    this.drivePathEl = this.svg.getElementById('svg-drive-path');
    this.drivePathGlowEl = this.svg.getElementById('svg-drive-path-glow');
    this.walkPathEl = this.svg.getElementById('svg-walk-path');
    this.drivingCarEl = this.svg.getElementById('svg-driving-car');

    this.carAnimationRaf = null;

    this.renderBaseLot();
    this.renderLandmarks();
    this.renderSlots();
    this.renderCars();
  }

  renderBaseLot() {
    const groundHtml = `
      <rect x="0" y="0" width="${CONFIG.CANVAS_WIDTH}" height="${CONFIG.CANVAS_HEIGHT}" fill="url(#asphalt-grid)" />
      
      <!-- Facility Perimeter Curb -->
      <rect x="18" y="18" width="${CONFIG.CANVAS_WIDTH - 36}" height="${CONFIG.CANVAS_HEIGHT - 36}" 
            rx="12" fill="none" stroke="var(--lot-curb)" stroke-width="2.5" opacity="0.6"/>

      <!-- Planter Islands -->
      <rect x="25" y="25" width="48" height="38" rx="6" fill="var(--lot-planter)" stroke="var(--lot-planter-border)" stroke-width="1.5"/>
      <rect x="740" y="25" width="110" height="38" rx="6" fill="var(--lot-planter)" stroke="var(--lot-planter-border)" stroke-width="1.5"/>

      <!-- Center Divider -->
      <rect x="40" y="275" width="1060" height="14" rx="3" fill="#0b0f19" stroke="var(--surface-panel-border)" stroke-width="1"/>
    `;
    this.layerGround.innerHTML = groundHtml;

    // Lanes & Markings
    const lanesHtml = `
      <!-- West Lane -->
      <line x1="50" y1="675" x2="50" y2="105" stroke="var(--lot-lane-divider)" stroke-width="1.5" stroke-dasharray="6, 6" opacity="0.6"/>

      <!-- Top Lane -->
      <line x1="50" y1="105" x2="1090" y2="105" stroke="var(--lot-lane-divider)" stroke-width="1.5" stroke-dasharray="6, 6" opacity="0.6"/>

      <!-- East Lane -->
      <line x1="1090" y1="105" x2="1090" y2="675" stroke="var(--lot-lane-divider)" stroke-width="1.5" stroke-dasharray="6, 6" opacity="0.6"/>

      <!-- Bottom Lane -->
      <line x1="50" y1="675" x2="1090" y2="675" stroke="var(--lot-lane-divider)" stroke-width="1.5" stroke-dasharray="6, 6" opacity="0.6"/>

      <!-- Driving Aisles -->
      <line x1="50" y1="195" x2="1090" y2="195" stroke="var(--lot-lane-marking)" stroke-width="1.5" stroke-dasharray="6, 6"/>
      <line x1="50" y1="390" x2="1090" y2="390" stroke="var(--lot-lane-marking)" stroke-width="1.5" stroke-dasharray="6, 6"/>
      <line x1="50" y1="580" x2="1090" y2="580" stroke="var(--lot-lane-marking)" stroke-width="1.5" stroke-dasharray="6, 6"/>

      <!-- Crosswalks -->
      <rect x="90" y="85" width="26" height="40" fill="url(#crosswalk-stripes)" rx="2"/>
      <rect x="555" y="85" width="36" height="40" fill="url(#crosswalk-stripes)" rx="2"/>
      <rect x="1025" y="85" width="28" height="40" fill="url(#crosswalk-stripes)" rx="2"/>

      <!-- Directional Arrows -->
      ${this.renderFlowArrow(50, 480, 0)}
      ${this.renderFlowArrow(50, 240, 0)}
      ${this.renderFlowArrow(330, 105, 90)}
      ${this.renderFlowArrow(810, 105, 90)}
      ${this.renderFlowArrow(1090, 240, 180)}
      ${this.renderFlowArrow(1090, 480, 180)}
      ${this.renderFlowArrow(450, 195, 90)}
      ${this.renderFlowArrow(700, 390, 270)}
      ${this.renderFlowArrow(450, 580, 90)}
    `;
    this.layerLanes.innerHTML = lanesHtml;
  }

  renderFlowArrow(x, y, angleDeg) {
    return `
      <g transform="translate(${x}, ${y}) rotate(${angleDeg})">
        <path d="M 0 -6 L 4 3 L 1.5 3 L 1.5 7 L -1.5 7 L -1.5 3 L -4 3 Z" fill="rgba(255, 255, 255, 0.3)"/>
      </g>
    `;
  }

  renderLandmarks() {
    const lm = CONFIG.LANDMARKS;
    let html = '';

    // Elevator
    html += `
      <g class="landmark-group" transform="translate(${lm.elevator.x}, ${lm.elevator.y})">
        <rect x="-42" y="-20" width="84" height="40" rx="6" fill="#182033" stroke="#38bdf8" stroke-width="1.5" />
        <text x="0" y="-3" font-family="var(--font-mono)" font-size="8.5" font-weight="600" fill="#38bdf8" text-anchor="middle">ELEVATOR</text>
        <text x="0" y="11" font-family="var(--font-ui)" font-size="7.5" fill="#94a3b8" text-anchor="middle">West Core</text>
      </g>
    `;

    // Building Main Entrance
    html += `
      <g class="landmark-group" transform="translate(${lm.main_entrance.x}, ${lm.main_entrance.y})">
        <rect x="-100" y="-22" width="200" height="44" rx="8" fill="#182033" stroke="#0284c7" stroke-width="2" />
        <rect x="-85" y="-16" width="170" height="10" rx="3" fill="rgba(2, 132, 199, 0.15)" />
        <text x="0" y="-9" font-family="var(--font-ui)" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.08em">BUILDING 1 — MAIN LOBBY</text>
        <text x="0" y="13" font-family="var(--font-ui)" font-size="8" font-weight="500" fill="#38bdf8" text-anchor="middle">Main Entrance & Reception</text>
      </g>
    `;

    // Retail Concourse
    html += `
      <g class="landmark-group" transform="translate(${lm.mall_gate.x}, ${lm.mall_gate.y})">
        <rect x="-45" y="-20" width="90" height="40" rx="6" fill="#182033" stroke="#818cf8" stroke-width="1.5" />
        <text x="0" y="-3" font-family="var(--font-mono)" font-size="8.5" font-weight="600" fill="#818cf8" text-anchor="middle">RETAIL GATE</text>
        <text x="0" y="11" font-family="var(--font-ui)" font-size="7.5" fill="#94a3b8" text-anchor="middle">East Concourse</text>
      </g>
    `;

    // North Entry Gate
    html += `
      <g class="landmark-group" transform="translate(${lm.entry_gate.x}, ${lm.entry_gate.y})">
        <rect x="-24" y="-16" width="48" height="32" rx="5" fill="#182033" stroke="#10b981" stroke-width="1.5" />
        <rect x="-20" y="12" width="40" height="3" fill="#10b981" />
        <text x="0" y="2" font-family="var(--font-mono)" font-size="8" font-weight="600" fill="#10b981" text-anchor="middle">ENTRY</text>
      </g>
    `;

    // Exit Gate
    html += `
      <g class="landmark-group" transform="translate(${lm.exit_gate.x}, ${lm.exit_gate.y})">
        <rect x="-24" y="-16" width="48" height="32" rx="5" fill="#182033" stroke="#ef4444" stroke-width="1.5" />
        <rect x="-20" y="12" width="40" height="3" fill="#ef4444" />
        <text x="0" y="2" font-family="var(--font-mono)" font-size="8" font-weight="600" fill="#ef4444" text-anchor="middle">EXIT</text>
      </g>
    `;

    this.layerLandmarks.innerHTML = html;
  }

  renderSlots() {
    let html = '';

    this.lot.slots.forEach(slot => {
      let typeLabel = '';
      if (slot.type === 'ev') typeLabel = 'EV';
      else if (slot.type === 'disabled') typeLabel = 'ACC';
      else if (slot.type === 'compact') typeLabel = 'C';

      let statusClass = 'slot-avail';
      if (slot.status === 'occupied') statusClass = 'slot-occ';
      else if (slot.status === 'reserved') statusClass = 'slot-res';

      const cx = slot.x + slot.width / 2;
      const cy = slot.y + slot.height / 2;

      html += `
        <g id="slot-group-${slot.id}" class="slot-group ${statusClass}" data-slot-id="${slot.id}">
          <rect id="slot-rect-${slot.id}" class="slot-rect" 
                x="${slot.x}" y="${slot.y}" 
                width="${slot.width}" height="${slot.height}" />

          <!-- EV Charging Bollard -->
          ${slot.type === 'ev' ? `
            <circle cx="${cx}" cy="${slot.orientation === 'south_facing' ? slot.y + 6 : slot.y + slot.height - 6}" r="2.5" fill="#38bdf8"/>
          ` : ''}

          <!-- Accessible Stall Striping -->
          ${slot.type === 'disabled' ? `
            <rect x="${slot.x + 3}" y="${slot.y + 4}" width="${slot.width - 6}" height="${slot.height - 8}" rx="2" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="2, 2" />
          ` : ''}

          <!-- Stall ID -->
          <text class="slot-text-id" x="${cx}" y="${slot.orientation === 'south_facing' ? slot.y + 15 : slot.y + slot.height - 13}">
            ${slot.id}
          </text>

          <!-- Type Marker -->
          ${typeLabel ? `
            <text class="slot-icon-badge" x="${cx}" y="${cy}">
              ${typeLabel}
            </text>
          ` : ''}
        </g>
      `;
    });

    this.layerSlots.innerHTML = html;
  }

  renderCars() {
    let html = '';

    this.lot.slots.forEach(slot => {
      if (slot.status === 'occupied' && slot.car) {
        const cx = slot.x + slot.width / 2;
        const cy = slot.y + slot.height / 2;
        const carWidth = slot.width - 16;
        const carHeight = slot.height - 20;

        html += `
          <g id="car-${slot.id}" class="parked-car" transform="translate(${cx}, ${cy})">
            <!-- Shadow -->
            <rect x="${-carWidth/2}" y="${-carHeight/2 + 2}" width="${carWidth}" height="${carHeight}" rx="4" fill="rgba(0,0,0,0.3)"/>
            <!-- Body -->
            <rect x="${-carWidth/2}" y="${-carHeight/2}" width="${carWidth}" height="${carHeight}" rx="4" 
                  fill="${slot.car.color}" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/>
            <!-- Windshield -->
            <rect x="${-carWidth/2 + 2.5}" y="${-carHeight/4}" width="${carWidth - 5}" height="${carHeight/2}" rx="1.5" 
                  fill="${slot.car.glassColor}"/>
            <!-- Roof -->
            <rect x="${-carWidth/2 + 4.5}" y="${-carHeight/6}" width="${carWidth - 9}" height="${carHeight/3}" rx="1" 
                  fill="${slot.car.color}"/>
            <!-- Lamps -->
            <circle cx="${-carWidth/2 + 3}" cy="${-carHeight/2 + 1.5}" r="1" fill="#fef08a"/>
            <circle cx="${carWidth/2 - 3}" cy="${-carHeight/2 + 1.5}" r="1" fill="#fef08a"/>
            <circle cx="${-carWidth/2 + 3}" cy="${carHeight/2 - 1.5}" r="1" fill="#ef4444"/>
            <circle cx="${carWidth/2 - 3}" cy="${carHeight/2 - 1.5}" r="1" fill="#ef4444"/>
          </g>
        `;
      }
    });

    this.layerCars.innerHTML = html;
  }

  updateSlotVisualState(slotId) {
    const slot = this.lot.slotsById[slotId];
    if (!slot) return;

    const group = this.svg.getElementById(`slot-group-${slot.id}`);
    if (!group) return;

    group.classList.remove('slot-avail', 'slot-occ', 'slot-res');

    if (slot.status === 'occupied') {
      group.classList.add('slot-occ');
    } else if (slot.status === 'reserved') {
      group.classList.add('slot-res');
    } else {
      group.classList.add('slot-avail');
    }

    this.renderCars();
  }

  highlightRecommendedSlot(slotId) {
    this.svg.querySelectorAll('.slot-recommended').forEach(el => {
      el.classList.remove('slot-recommended');
    });

    if (!slotId) return;

    const group = this.svg.getElementById(`slot-group-${slotId}`);
    if (group) {
      group.classList.add('slot-recommended');
    }
  }

  animateNavigationRoute(driveWaypoints, slot, destinationLandmarkId, onComplete) {
    if (!driveWaypoints || driveWaypoints.length < 2) return;

    let d = `M ${driveWaypoints[0].x} ${driveWaypoints[0].y}`;
    for (let i = 1; i < driveWaypoints.length; i++) {
      d += ` L ${driveWaypoints[i].x} ${driveWaypoints[i].y}`;
    }
    d += ` L ${slot.centerPoint.x} ${slot.centerPoint.y}`;

    this.drivePathEl.setAttribute('d', d);
    this.drivePathGlowEl.setAttribute('d', d);

    const lm = CONFIG.LANDMARKS[destinationLandmarkId];
    if (lm) {
      const walkD = `M ${slot.centerPoint.x} ${slot.centerPoint.y} L ${slot.centerPoint.x} 105 L ${lm.x} ${lm.y}`;
      this.walkPathEl.setAttribute('d', walkD);
    }

    this.animateCarAlongPath(this.drivePathEl, onComplete);
  }

  animateCarAlongPath(pathEl, onComplete) {
    if (this.carAnimationRaf) {
      cancelAnimationFrame(this.carAnimationRaf);
    }

    const totalLength = pathEl.getTotalLength();
    if (totalLength === 0) return;

    this.drivingCarEl.classList.remove('hide');

    const duration = 2500;
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      const currentDist = progress * totalLength;
      const pt = pathEl.getPointAtLength(currentDist);

      const lookAheadDist = Math.min(currentDist + 3, totalLength);
      const lookAheadPt = pathEl.getPointAtLength(lookAheadDist);

      const angleRad = Math.atan2(lookAheadPt.y - pt.y, lookAheadPt.x - pt.x);
      const angleDeg = angleRad * (180 / Math.PI);

      this.drivingCarEl.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angleDeg})`);

      if (progress < 1.0) {
        this.carAnimationRaf = requestAnimationFrame(step);
      } else {
        this.carAnimationRaf = null;
        if (onComplete) onComplete();
      }
    };

    this.carAnimationRaf = requestAnimationFrame(step);
  }

  clearRoute() {
    if (this.carAnimationRaf) {
      cancelAnimationFrame(this.carAnimationRaf);
      this.carAnimationRaf = null;
    }
    this.drivePathEl.setAttribute('d', '');
    this.drivePathGlowEl.setAttribute('d', '');
    this.walkPathEl.setAttribute('d', '');
    this.drivingCarEl.classList.add('hide');
  }
}

/* ==============================================================================
   SECTION 8: TACTILE AUDIO ENGINE (MUTED, NATURAL UI SOUNDS)
   ============================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isEnabled = true;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  // Subtle tap sound (like native OS click)
  playTap(freq = 440) {
    if (!this.isEnabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch (e) {}
  }

  // Soft match chime
  playMatchChime() {
    if (!this.isEnabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      [587.33, 880.00].forEach((freq, idx) => {
        setTimeout(() => {
          this.playTap(freq);
        }, idx * 70);
      });
    } catch (e) {}
  }

  // Subtle muted alert
  playAlert() {
    if (!this.isEnabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(260, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.16);
    } catch (e) {}
  }
}

/* ==============================================================================
   SECTION 9: UI CONTROLLER & EVENT ORCHESTRATION
   ============================================================================== */

class AppController {
  constructor() {
    this.graph = new RoadGraph();
    this.lot = new ParkingLot(this.graph);
    this.pathfinder = new AStarPathfinder(this.graph);
    this.aiEngine = new AIScoringEngine(this.lot);
    this.audio = new AudioEngine();

    this.cacheDom();
    this.renderer = new MapRenderer(this.dom.svg, this.lot);

    this.currentDestination = 'main_entrance';
    this.currentVehicleType = 'regular';
    this.currentWeights = { ...CONFIG.DEFAULT_WEIGHTS };
    this.activeRecommendation = null;
    this.activeRouteSlot = null;
    this.reservationTimerInterval = null;
    this.reservationRemainingSeconds = 600;

    this.sim = new SimulationEngine(this.lot, () => this.handleSimulationTick());

    this.bindEvents();
    this.updateHeaderStats();
    this.updateZoneMeters();

    setTimeout(() => {
      this.runAIOptimization(false);
    }, 200);
  }

  cacheDom() {
    this.dom = {
      app: document.getElementById('app'),
      svg: document.getElementById('parking-svg'),
      mapWrapper: document.getElementById('map-wrapper'),
      tooltip: document.getElementById('slot-tooltip'),
      toastContainer: document.getElementById('toast-container'),

      // Header Telemetry
      statTotal: document.getElementById('stat-total'),
      statAvail: document.getElementById('stat-available'),
      statOcc: document.getElementById('stat-occupied'),
      statRes: document.getElementById('stat-reserved'),
      statPercent: document.getElementById('stat-percent'),
      occRingFill: document.getElementById('occ-ring-val'),

      // Header Actions
      btnAudioToggle: document.getElementById('btn-audio-toggle'),
      iconSoundOn: document.querySelector('.icon-sound-on'),
      iconSoundOff: document.querySelector('.icon-sound-off'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      iconMoon: document.querySelector('.icon-moon'),
      iconSun: document.querySelector('.icon-sun'),

      // Preferences
      selectDestination: document.getElementById('select-destination'),
      vehicleTypeBtns: document.querySelectorAll('.vehicle-btn'),
      btnResetWeights: document.getElementById('btn-reset-weights'),
      btnFindSpot: document.getElementById('btn-find-spot'),
      btnTriggerReroute: document.getElementById('btn-trigger-reroute'),

      // Sliders
      sliderWalk: document.getElementById('slider-weight-walk'),
      valWalk: document.getElementById('val-weight-walk'),
      sliderCongestion: document.getElementById('slider-weight-congestion'),
      valCongestion: document.getElementById('val-weight-congestion'),
      sliderExit: document.getElementById('slider-weight-exit'),
      valExit: document.getElementById('val-weight-exit'),
      sliderDrive: document.getElementById('slider-weight-drive'),
      valDrive: document.getElementById('val-weight-drive'),

      // Simulation
      btnSimPlay: document.getElementById('btn-sim-play'),
      iconSimPause: document.getElementById('icon-sim-pause'),
      iconSimPlay: document.getElementById('icon-sim-play'),
      textSimPlay: document.getElementById('text-sim-play'),
      btnRushHour: document.getElementById('btn-rush-hour'),
      speedPills: document.querySelectorAll('.speed-pill'),

      // Zone meters
      countZoneA: document.getElementById('count-zone-a'),
      fillZoneA: document.getElementById('fill-zone-a'),
      countZoneB: document.getElementById('count-zone-b'),
      fillZoneB: document.getElementById('fill-zone-b'),
      countZoneC: document.getElementById('count-zone-c'),
      fillZoneC: document.getElementById('fill-zone-c'),

      // Route HUD
      routeHud: document.getElementById('route-hud'),
      hudSlotId: document.getElementById('hud-slot-id'),
      hudDriveDist: document.getElementById('hud-drive-dist'),
      hudWalkDist: document.getElementById('hud-walk-dist'),
      hudEta: document.getElementById('hud-eta'),
      btnCancelRoute: document.getElementById('btn-cancel-route'),

      // Tooltip items
      ttId: document.getElementById('tt-id'),
      ttStatus: document.getElementById('tt-status'),
      ttType: document.getElementById('tt-type'),
      ttZone: document.getElementById('tt-zone'),
      ttWalk: document.getElementById('tt-walk'),
      ttExit: document.getElementById('tt-exit'),

      // Recommendation Card
      heroSlotId: document.getElementById('hero-slot-id'),
      heroMatchScore: document.getElementById('hero-match-score'),
      heroTypeTag: document.getElementById('hero-type-tag'),
      heroZoneTag: document.getElementById('hero-zone-tag'),
      aiReasoningText: document.getElementById('ai-reasoning-text'),

      // Breakdown bars
      barWalkScore: document.getElementById('bar-walk-score'),
      factorWalkVal: document.getElementById('factor-walk-val'),
      barDriveScore: document.getElementById('bar-drive-score'),
      factorDriveVal: document.getElementById('factor-drive-val'),
      barFlowScore: document.getElementById('bar-flow-score'),
      factorFlowVal: document.getElementById('factor-flow-val'),
      barExitScore: document.getElementById('bar-exit-score'),
      factorExitVal: document.getElementById('factor-exit-val'),
      barTypeScore: document.getElementById('bar-type-score'),
      factorTypeVal: document.getElementById('factor-type-val'),

      // Reservation
      btnReserveSlot: document.getElementById('btn-reserve-slot'),
      textReserveBtn: document.getElementById('text-reserve-btn'),
      reservationTimer: document.getElementById('reservation-timer'),
      timerCountdown: document.getElementById('timer-countdown'),
      btnCancelReservation: document.getElementById('btn-cancel-reservation'),

      // Alternatives
      altCardsList: document.getElementById('alt-cards-list')
    };
  }

  bindEvents() {
    this.dom.btnThemeToggle.addEventListener('click', () => this.toggleTheme());

    this.dom.btnAudioToggle.addEventListener('click', () => {
      const active = this.audio.toggle();
      this.dom.iconSoundOn.classList.toggle('hide', !active);
      this.dom.iconSoundOff.classList.toggle('hide', active);
      this.showToast(active ? 'Audio cues enabled' : 'Audio muted', 'info');
    });

    this.dom.selectDestination.addEventListener('change', (e) => {
      this.currentDestination = e.target.value;
      this.audio.playTap(520);
      this.runAIOptimization(false);
    });

    this.dom.vehicleTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.vehicleTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentVehicleType = btn.dataset.type;
        this.audio.playTap(580);
        this.runAIOptimization(false);
      });
    });

    const setupSlider = (slider, label, key) => {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        label.textContent = `${val}%`;
        this.currentWeights[key] = val;
      });
      slider.addEventListener('change', () => {
        this.runAIOptimization(false);
      });
    };

    setupSlider(this.dom.sliderWalk, this.dom.valWalk, 'walking');
    setupSlider(this.dom.sliderCongestion, this.dom.valCongestion, 'congestion');
    setupSlider(this.dom.sliderExit, this.dom.valExit, 'exit');
    setupSlider(this.dom.sliderDrive, this.dom.valDrive, 'driving');

    this.dom.btnResetWeights.addEventListener('click', () => {
      this.currentWeights = { ...CONFIG.DEFAULT_WEIGHTS };
      this.dom.sliderWalk.value = 80; this.dom.valWalk.textContent = '80%';
      this.dom.sliderCongestion.value = 60; this.dom.valCongestion.textContent = '60%';
      this.dom.sliderExit.value = 40; this.dom.valExit.textContent = '40%';
      this.dom.sliderDrive.value = 50; this.dom.valDrive.textContent = '50%';
      this.audio.playTap(440);
      this.runAIOptimization(false);
    });

    this.dom.btnFindSpot.addEventListener('click', () => {
      this.audio.playTap(600);
      this.runAIOptimization(true);
    });

    this.dom.btnTriggerReroute.addEventListener('click', () => {
      this.triggerMidRouteRerouteDemo();
    });

    this.dom.btnSimPlay.addEventListener('click', () => {
      if (this.sim.isRunning) {
        this.sim.pause();
        this.dom.btnSimPlay.classList.remove('active');
        this.dom.iconSimPause.classList.add('hide');
        this.dom.iconSimPlay.classList.remove('hide');
        this.dom.textSimPlay.textContent = 'Simulation Paused';
        this.showToast('Lot simulation paused', 'info');
      } else {
        this.sim.start();
        this.dom.btnSimPlay.classList.add('active');
        this.dom.iconSimPause.classList.remove('hide');
        this.dom.iconSimPlay.classList.add('hide');
        this.dom.textSimPlay.textContent = 'Simulation Active';
        this.showToast('Lot simulation resumed', 'info');
      }
      this.audio.playTap(480);
    });

    this.dom.btnRushHour.addEventListener('click', () => {
      this.audio.playAlert();
      this.showToast('Simulating rush hour surge...', 'info');
      this.dom.btnRushHour.disabled = true;

      this.sim.triggerRushHour(() => {
        this.dom.btnRushHour.disabled = false;
        this.showToast('Rush hour peak reached. Lot at 90%+ occupancy.', 'info');
        this.runAIOptimization(true);
      });
    });

    this.dom.speedPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.dom.speedPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const speed = parseFloat(pill.dataset.speed);
        this.sim.setSpeed(speed);
        this.audio.playTap(500);
      });
    });

    this.dom.btnCancelRoute.addEventListener('click', () => {
      this.renderer.clearRoute();
      this.dom.routeHud.classList.add('hide');
      if (this.activeRouteSlot) {
        this.activeRouteSlot.isUserSelected = false;
        this.activeRouteSlot = null;
      }
    });

    this.dom.svg.addEventListener('mousemove', (e) => this.handleMapHover(e));
    this.dom.svg.addEventListener('mouseleave', () => this.hideTooltip());
    this.dom.svg.addEventListener('click', (e) => this.handleMapClick(e));

    this.dom.btnReserveSlot.addEventListener('click', () => this.reserveCurrentSpot());
    this.dom.btnCancelReservation.addEventListener('click', () => this.cancelReservation());
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);

    this.dom.iconMoon.classList.toggle('hide', nextTheme === 'light');
    this.dom.iconSun.classList.toggle('hide', nextTheme === 'dark');
    this.audio.playTap(520);
    this.showToast(`Switched to ${nextTheme === 'dark' ? 'Dark' : 'Light'} Theme`, 'info');
  }

  runAIOptimization(shouldAnimateRoute = true) {
    const preferences = {
      destination: this.currentDestination,
      vehicleType: this.currentVehicleType,
      weights: this.currentWeights
    };

    const result = this.aiEngine.evaluate(preferences);
    this.activeRecommendation = result;

    if (!result.topPick) {
      this.dom.heroSlotId.textContent = 'None';
      this.dom.heroMatchScore.textContent = '0%';
      this.dom.aiReasoningText.textContent = 'No open spots match current criteria. Adjust vehicle type or wait for spots to clear.';
      this.dom.altCardsList.innerHTML = '<div class="empty-alt-placeholder">No matching available spots.</div>';
      this.dom.btnReserveSlot.disabled = true;
      return;
    }

    const { topPick, alternatives } = result;

    this.dom.heroSlotId.textContent = topPick.slot.id;
    this.dom.heroMatchScore.textContent = `${topPick.matchScorePercent}%`;
    this.dom.heroTypeTag.textContent = this.formatType(topPick.slot.type);
    this.dom.heroZoneTag.textContent = `Zone ${topPick.slot.zone}`;
    this.dom.aiReasoningText.textContent = topPick.reasoning;

    this.dom.barWalkScore.style.width = `${topPick.breakdown.walkScore}%`;
    this.dom.factorWalkVal.textContent = `${topPick.breakdown.walkMeters} m (${topPick.breakdown.walkScore}/100)`;

    this.dom.barDriveScore.style.width = `${topPick.breakdown.driveScore}%`;
    this.dom.factorDriveVal.textContent = `${topPick.breakdown.driveMeters} m (${topPick.breakdown.driveScore}/100)`;

    this.dom.barFlowScore.style.width = `${topPick.breakdown.flowScore}%`;
    this.dom.factorFlowVal.textContent = `${topPick.breakdown.congestionRate}% occupied (${topPick.breakdown.flowScore}/100)`;

    this.dom.barExitScore.style.width = `${topPick.breakdown.exitScore}%`;
    this.dom.factorExitVal.textContent = `${topPick.breakdown.exitMeters} m (${topPick.breakdown.exitScore}/100)`;

    this.dom.barTypeScore.style.width = `${topPick.breakdown.typeScore}%`;
    this.dom.factorTypeVal.textContent = `${topPick.breakdown.typeScore}/100 match`;

    this.dom.btnReserveSlot.disabled = topPick.slot.status !== 'available';
    this.renderAlternatives(alternatives);
    this.renderer.highlightRecommendedSlot(topPick.slot.id);

    if (shouldAnimateRoute) {
      this.routeToSlot(topPick.slot, false);
      this.audio.playMatchChime();
    }
  }

  routeToSlot(slot, isManualClick = false) {
    if (!slot) return;

    if (this.activeRouteSlot && this.activeRouteSlot !== slot) {
      this.activeRouteSlot.isUserSelected = false;
    }

    slot.isUserSelected = true;
    this.activeRouteSlot = slot;

    const startNode = 'N_ENTRY';
    const goalNode = slot.accessNodeId;
    const driveWaypoints = this.pathfinder.findPath(startNode, goalNode);

    const walkMeters = slot.distances[this.currentDestination] || 35;
    const driveMeters = slot.distances.driveFromEntry || 65;
    const etaSec = Math.round((driveMeters / 6) + (walkMeters / 1.3));
    const etaFormatted = `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`;

    this.dom.hudSlotId.textContent = slot.id;
    this.dom.hudDriveDist.textContent = `${driveMeters} m`;
    this.dom.hudWalkDist.textContent = `${walkMeters} m`;
    this.dom.hudEta.textContent = etaFormatted;
    this.dom.routeHud.classList.remove('hide');

    this.renderer.animateNavigationRoute(driveWaypoints, slot, this.currentDestination, () => {
      this.showToast(`Arrived at slot ${slot.id}`, 'success');
    });

    if (isManualClick) {
      this.renderer.highlightRecommendedSlot(slot.id);
      this.audio.playTap(520);
      this.showToast(`Navigating to ${slot.id}`, 'info');
    }
  }

  triggerMidRouteRerouteDemo() {
    if (!this.activeRouteSlot) {
      const open = this.lot.slots.find(s => s.status === 'available');
      if (open) {
        this.routeToSlot(open);
      } else {
        this.showToast('No spots available to simulate reroute on.', 'alert');
        return;
      }
    }

    const takenSlot = this.activeRouteSlot;
    takenSlot.status = 'occupied';
    takenSlot.car = this.sim.getRandomCar();
    takenSlot.isUserSelected = false;
    this.renderer.updateSlotVisualState(takenSlot.id);

    this.audio.playAlert();
    this.showToast(`Spot ${takenSlot.id} was taken. Recalculating next best route...`, 'alert');

    setTimeout(() => {
      const rerun = this.aiEngine.evaluate({
        destination: this.currentDestination,
        vehicleType: this.currentVehicleType,
        weights: this.currentWeights
      });

      if (rerun.topPick) {
        const newSlot = rerun.topPick.slot;
        this.runAIOptimization(false);
        this.routeToSlot(newSlot, false);
        this.showToast(`Rerouted to spot ${newSlot.id}`, 'info');
      } else {
        this.showToast('Lot full. No alternative spot open.', 'alert');
      }
    }, 600);
  }

  reserveCurrentSpot() {
    const targetSlot = this.activeRouteSlot || (this.activeRecommendation?.topPick?.slot);
    if (!targetSlot || targetSlot.status !== 'available') {
      this.showToast('Spot cannot be reserved', 'alert');
      return;
    }

    targetSlot.status = 'reserved';
    this.renderer.updateSlotVisualState(targetSlot.id);
    this.renderer.highlightRecommendedSlot(targetSlot.id);

    this.dom.btnReserveSlot.classList.add('hide');
    this.dom.reservationTimer.classList.remove('hide');

    this.reservationRemainingSeconds = 600;
    this.updateTimerDisplay();

    if (this.reservationTimerInterval) clearInterval(this.reservationTimerInterval);
    this.reservationTimerInterval = setInterval(() => {
      this.reservationRemainingSeconds--;
      this.updateTimerDisplay();
      if (this.reservationRemainingSeconds <= 0) {
        this.cancelReservation();
        this.showToast(`Reservation for ${targetSlot.id} expired`, 'info');
      }
    }, 1000);

    this.audio.playMatchChime();
    this.showToast(`Spot ${targetSlot.id} reserved for 10 minutes`, 'success');
  }

  cancelReservation() {
    if (this.reservationTimerInterval) {
      clearInterval(this.reservationTimerInterval);
      this.reservationTimerInterval = null;
    }

    const targetSlot = this.activeRouteSlot || (this.activeRecommendation?.topPick?.slot);
    if (targetSlot && targetSlot.status === 'reserved') {
      targetSlot.status = 'available';
      this.renderer.updateSlotVisualState(targetSlot.id);
    }

    this.dom.reservationTimer.classList.add('hide');
    this.dom.btnReserveSlot.classList.remove('hide');
    this.showToast('Reservation cancelled', 'info');
  }

  updateTimerDisplay() {
    const mins = Math.floor(this.reservationRemainingSeconds / 60);
    const secs = this.reservationRemainingSeconds % 60;
    this.dom.timerCountdown.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  renderAlternatives(alternatives) {
    if (!alternatives || alternatives.length === 0) {
      this.dom.altCardsList.innerHTML = '<div class="empty-alt-placeholder">No alternative spots found.</div>';
      return;
    }

    let html = '';
    alternatives.forEach((item, index) => {
      const rank = index + 2;
      const walk = item.breakdown.walkMeters;
      html += `
        <div class="alt-card" data-slot-id="${item.slot.id}">
          <div class="alt-rank-tag">#${rank}</div>
          <div class="alt-meta">
            <span class="alt-id">${item.slot.id} (${this.formatType(item.slot.type)})</span>
            <span class="alt-walk">${walk} m walk • Zone ${item.slot.zone}</span>
          </div>
          <div class="alt-score">${item.matchScorePercent}%</div>
        </div>
      `;
    });

    this.dom.altCardsList.innerHTML = html;

    this.dom.altCardsList.querySelectorAll('.alt-card').forEach(card => {
      card.addEventListener('click', () => {
        const slotId = card.dataset.slotId;
        const slot = this.lot.slotsById[slotId];
        if (slot) {
          this.routeToSlot(slot, true);
        }
      });
    });
  }

  handleMapHover(e) {
    const slotGroup = e.target.closest('.slot-group');
    if (!slotGroup) {
      this.hideTooltip();
      return;
    }

    const slotId = slotGroup.dataset.slotId;
    const slot = this.lot.slotsById[slotId];
    if (!slot) return;

    this.dom.ttId.textContent = slot.id;
    this.dom.ttStatus.textContent = slot.status.toUpperCase();
    this.dom.ttStatus.style.color = slot.status === 'available' ? 'var(--status-avail)' : 
                                    slot.status === 'occupied' ? 'var(--status-occ)' : 'var(--status-res)';
    this.dom.ttType.textContent = this.formatType(slot.type);
    this.dom.ttZone.textContent = `Zone ${slot.zone}`;
    this.dom.ttWalk.textContent = `${slot.distances[this.currentDestination] || 30} m`;
    this.dom.ttExit.textContent = `${slot.distances.driveToExit || 65} m`;

    const wrapperRect = this.dom.mapWrapper.getBoundingClientRect();
    const x = e.clientX - wrapperRect.left;
    const y = e.clientY - wrapperRect.top;

    this.dom.tooltip.style.left = `${x}px`;
    this.dom.tooltip.style.top = `${y - 10}px`;
    this.dom.tooltip.classList.remove('hide');
  }

  hideTooltip() {
    this.dom.tooltip.classList.add('hide');
  }

  handleMapClick(e) {
    const slotGroup = e.target.closest('.slot-group');
    if (!slotGroup) return;

    const slotId = slotGroup.dataset.slotId;
    const slot = this.lot.slotsById[slotId];
    if (!slot) return;

    if (slot.status === 'occupied') {
      this.audio.playAlert();
      this.showToast(`Stall ${slot.id} is occupied`, 'alert');
      return;
    }

    this.routeToSlot(slot, true);
  }

  handleSimulationTick() {
    this.updateHeaderStats();
    this.updateZoneMeters();
    this.renderer.renderCars();

    if (this.activeRouteSlot && this.activeRouteSlot.status === 'occupied') {
      this.triggerMidRouteRerouteDemo();
    }
  }

  updateHeaderStats() {
    const stats = this.lot.getGlobalStats();

    this.dom.statTotal.textContent = stats.total;
    this.dom.statAvail.textContent = stats.available;
    this.dom.statOcc.textContent = stats.occupied;
    this.dom.statRes.textContent = stats.reserved;
    this.dom.statPercent.textContent = `${stats.occupancyPercent}%`;

    this.dom.occRingFill.setAttribute('stroke-dasharray', `${stats.occupancyPercent}, 100`);

    if (stats.occupancyPercent > 85) {
      this.dom.occRingFill.style.stroke = 'var(--status-occ)';
    } else if (stats.occupancyPercent > 65) {
      this.dom.occRingFill.style.stroke = 'var(--status-res)';
    } else {
      this.dom.occRingFill.style.stroke = 'var(--accent-primary)';
    }
  }

  updateZoneMeters() {
    const a = this.lot.getZoneStats('A');
    const b = this.lot.getZoneStats('B');
    const c = this.lot.getZoneStats('C');

    const updateMeter = (countEl, fillEl, stats) => {
      countEl.textContent = `${stats.occupied + stats.reserved}/${stats.total} (${Math.round(stats.occupancyRate * 100)}%)`;
      fillEl.style.width = `${Math.round(stats.occupancyRate * 100)}%`;
      if (stats.occupancyRate > 0.85) {
        fillEl.style.background = 'var(--status-occ)';
      } else if (stats.occupancyRate > 65) {
        fillEl.style.background = 'var(--status-res)';
      } else {
        fillEl.style.background = 'var(--accent-primary)';
      }
    };

    updateMeter(this.dom.countZoneA, this.dom.fillZoneA, a);
    updateMeter(this.dom.countZoneB, this.dom.fillZoneB, b);
    updateMeter(this.dom.countZoneC, this.dom.fillZoneC, c);
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-title">${type === 'alert' ? 'Notice' : type === 'success' ? 'Confirmed' : 'Update'}</span>
        <span class="toast-msg">${message}</span>
      </div>
    `;

    this.dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  formatType(type) {
    if (type === 'ev') return 'EV Charging';
    if (type === 'disabled') return 'Accessible';
    if (type === 'compact') return 'Compact';
    return 'Standard';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.parkEaseApp = new AppController();
});
