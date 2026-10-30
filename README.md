# ParkEase — Smart Facility Parking System

> **A modern, production-grade parking guidance and space allocation web app.**  
> Built with vanilla HTML5, CSS3, and ES6 JavaScript. No build step, no framework bloat, and zero external dependencies. Opens instantly by double-clicking `index.html`.

---

## 🏢 Overview & Design Philosophy

ParkEase was designed with the visual restraint and precision of production software (inspired by Apple Maps, Tesla OS, and modern transit operations dashboards):
- **Clean Vector Facility Map**: 62 parking bays across 3 zones (Zone A: Premium, Zone B: Central, Zone C: Express Exit) with clear lane markings, pedestrian crosswalks, and architectural landmarks.
- **No Gimmicky AI Tropes**: Free of arcade-style neon glow overlays, tacky laser scanlines, and emoji clutter. Instead, it uses crisp SVG iconography, clear status badges, and refined micro-typography.
- **Autonomous Simulation**: Continuous vehicular turnover (cars naturally arrive and depart), real-time occupancy ring, and zone traffic load meters.
- **Multi-Objective Routing**: Evaluates all open stalls using a weighted scoring formula across walking distance, driving path, zone traffic, exit proximity, and vehicle compatibility.
- **A\* Pathfinding & Vehicle Animation**: Real graph-based navigation respecting one-way driving aisles, complete with dynamic rerouting if a slot is occupied mid-transit.

---

## 🚀 How to Run

1. Open your file explorer or Finder.
2. Locate `index.html` inside this project directory (`/Users/yatimehta/EAI Project`).
3. **Double-click `index.html`** to open it directly in your browser (Chrome, Safari, Edge, Firefox).

---

## 🎬 5-Step Presentation Script

| Step | Action | What to Explain |
| :--- | :--- | :--- |
| **1. Facility Overview** | Open [index.html](file:///Users/yatimehta/EAI%20Project/index.html). Point out the header stats, zone meters, and map. | *"Notice the live telemetry: IoT sensors track capacity across 62 stalls in Zones A, B, and C. The lot is dynamic—vehicles naturally arrive and depart."* |
| **2. Configure Preferences** | Set Destination to **West Elevator & Stairs Core** and Category to **EV Charging**. | *"The driver is operating an EV and heading to the West Elevator. We can tune priority weights between walking distance, driving path, traffic flow, and exit speed."* |
| **3. Find Best Spot** | Click **Find Best Spot**. | *"The system scores every open stall against our multi-objective formula, penalizing non-EV bays and heavy traffic areas to pick the optimal stall."* |
| **4. Route Guidance & Reasoning** | Observe the **Top Pick** card, factor breakdown bars, and the animated vehicle along the route. | *"The recommendation card clearly explains the trade-offs in plain language. The vehicle smoothly navigates the driving lanes while pedestrian guidance connects to the elevator."* |
| **5. Reroute & Rush Hour** | Click **"Simulate Spot Taken (Test Reroute)"** or trigger **"Rush Hour"**. | *"If another vehicle takes the assigned spot mid-drive, ParkEase detects the conflict immediately, alerts the driver, and reroutes to the next best alternative."* |

---

## 📐 Architecture

- **[index.html](file:///Users/yatimehta/EAI%20Project/index.html)**: Clean semantic HTML5 layout with SVG map viewport, HUD overlays, and toast notifications.
- **[style.css](file:///Users/yatimehta/EAI%20Project/style.css)**: Clean dark & light themes, custom CSS variables, refined typography, and responsive grid.
- **[app.js](file:///Users/yatimehta/EAI%20Project/app.js)**: Modular ES6 engine with road graph, A* pathfinder, scoring engine, simulation engine, SVG renderer, and tactile audio feedback.
