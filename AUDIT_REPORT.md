# Museum System — Functional Audit Report

## Part 1 — Functional Test Checklist

### 1️⃣ Core UI Buttons & Navigation

| Feature | Triggers (Code) | Status | Observations |
| :--- | :--- | :--- | :--- |
| **Blue Team Tab** | Sets `currentTeam` state to `TeamType.BLUE`. | ✅ Works | Updates UI to show Blue Team view. |
| **Green Team Tab** | Sets `currentTeam` state to `TeamType.GREEN`. | ✅ Works | Updates UI to show Green Team view. |
| **Swap Selected** | Calls `swapSelectedEmployees`. Swaps names in `employeeNames` and `greenEmployeeNames` for selected IDs. | ✅ Works | Respects locks. Only swaps names, IDs remain fixed. |
| **Swap Entire Team** | Calls `swapEntireTeams`. Iterates through all IDs and swaps names. | ✅ Works | Respects locks. Preserves ID-based schedule logic. |
| **Lock/Unlock** | Calls `toggleTeamLock`. Updates `teamLocks` state. | ✅ Works | Prevents swapping for specific IDs. |
| **Re-Shuffle (Green)** | Increments `greenRefreshTrigger`. Triggers `useEffect` to re-run `generateGreenSchedule`. | ✅ Works | Forces a new random schedule generation. |
| **Analyze Schedule** | Calls `handleAnalyze` -> `analyzeScheduleWithGemini`. | ⚠️ Partial | **CRASH RISK:** If `API_KEY` is missing/invalid, the app will crash due to an unhandled promise rejection in `analyzeScheduleWithGemini` (Error thrown outside try/catch). |
| **Reset System** | Calls `handleResetSystem`. Clears `localStorage` and resets state to defaults. | ✅ Works | Effectively wipes all data and reloads the page. |

### 2️⃣ Drag & Drop Behavior (Green Team)

**Verification Results:**
*   **Updates UI correctly:** ✅ Yes, React state updates immediately.
*   **Locks that assignment:** ✅ Yes, adds the move to `forcedAssignments`.
*   **Triggers reshuffling:** ✅ Yes, `forcedAssignments` change triggers `generateGreenSchedule`.
*   **Locked slots remain fixed:** ✅ Yes, forced assignments are processed *first* in the scheduler, removing those employees from the available pool.
*   **Constraint rules still apply:** ✅ Yes, the remaining slots are filled using the standard constraint logic. However, manual moves *can* violate rules if the user forces them (e.g., forcing a repeat). The system logs a warning in such cases.
*   **Console errors:** ✅ None observed during logic verification.

**Internal Code Flow (Drag & Drop):**
1.  **Drop Event:** User drops an employee card on a station slot. `handleDrop` is triggered.
2.  **State Update:** `handleDrop` updates the `forcedAssignments` state array, adding an object `{ rotationId, station, employeeId }` and removing any previous force for that employee in that rotation.
3.  **Re-Render & Effect:** The state change triggers a React re-render. The `useEffect` hook dependent on `forcedAssignments` fires.
4.  **Scheduler Execution:** `generateGreenSchedule` is called with the new `forcedAssignments`.
5.  **Forced Processing:** Inside the scheduler, `forcedAssignments` for the current rotation are processed *first*. The specified employees are assigned to their forced stations and **removed** from the `availablePool`.
6.  **Fill Remaining:** The scheduler fills the remaining empty slots using the standard scoring algorithm (checking constraints like consecutive repeats, etc.) with the remaining employees in the pool.
7.  **Output:** A new schedule object is returned and set to `greenData`, updating the UI.

### 3️⃣ Constraint Enforcement

| Rule | Status | Code verification |
| :--- | :--- | :--- |
| **No consecutive station repetition** | ✅ Enforced | Logic adds a "Nuclear penalty" (5,000,000 pts) to the score if a candidate was at the same station in the previous rotation. |
| **Planetarium repeat avoidance** | ✅ Enforced | Logic adds a "Maximum penalty" (10,000,000 pts) if a candidate has already done Planetarium. |
| **Minimum coverage priority** | ✅ Enforced | `assignBestCandidates` is called in a specific order: Ticket (1st) -> Greeter (1st) -> Planetarium (1st) -> Ticket (2nd) -> Museum. This ensures critical roles are filled first. |
| **Re-shuffle maintains constraints** | ✅ Enforced | Reshuffling uses the same scoring logic, just with a different random seed (shuffled pool). |
| **Team swap resets logic** | ⚠️ Partial | Swapping teams changes **Names**, but the logic operates on **IDs** (`B1`, `B2`). History tracks IDs. If you swap "Alice" (A1) to "B1", she inherits B1's history for the day. |

### 4️⃣ LocalStorage Verification

**Status:** ✅ Active and Working.
**Behavior:**
*   **Saves state automatically:** Yes, via `useEffect` hooks on state changes.
*   **Restores state on refresh:** Yes, via `useState(() => loadState(...))` initializers.

**LocalStorage Breakdown:**

| Key | Data Structure | Purpose |
| :--- | :--- | :--- |
| `museum_blue_config` | JSON Object (`ScheduleConfig`) | Stores frequency, show times, number of employees, etc. |
| `museum_blue_names` | JSON Object (`Record<string, string>`) | Maps Blue Team IDs (`A1`) to Names. |
| `museum_blue_shifts` | JSON Object (`Record<string, {start, end}>`) | Stores shift times for Blue Team. |
| `museum_green_count` | Number | Number of Green Team employees. |
| `museum_green_names` | JSON Object (`Record<string, string>`) | Maps Green Team IDs (`B1`) to Names. |
| `museum_green_tasks` | JSON Array (`SideTaskRule[]`) | Stores "Side Task" assignments (locked out of rotation). |
| `museum_green_exceptions` | JSON Array (`ShiftException[]`) | Stores custom shift hours for Green Team. |
| `museum_green_forced` | JSON Array (`ForcedAssignment[]`) | Stores manual Drag & Drop overrides. |
| `museum_current_team` | String (`'Blue'` \| `'Green'`) | Remembers the active tab. |
| `museum_team_locks` | JSON Object | Stores which IDs are locked from swapping. |

### 5️⃣ Error & Stability Audit

*   **Console Warnings:** None observed in standard operation.
*   **Edge Cases:**
    *   **0 Employees:** Handled gracefully (empty schedule).
    *   **Low Staff (Green):** Generates critical notifications but does not crash.
    *   **Shift Exceptions:** Logic was verified to correctly exclude employees from assignments during their off-hours.
*   **Crash Risk:** **High** if `Analyze Schedule` is used without an API Key. The `analyzeScheduleWithGemini` function throws an error *before* the `try/catch` block if `process.env.API_KEY` is missing. This results in an Unhandled Promise Rejection which can crash the React app or leave it in an inconsistent state.

---

# Part 2 — Plain English System Documentation

## Museum System — Current Code Behavior Summary

### 1️⃣ How Blue Team Scheduling Works

The Blue Team schedule is **deterministic**. This means if you input the same configuration (Show times, Staff count), you will always get the exact same schedule. It does not use randomness.

**How it works:**
1.  **Grid Generation:** The system calculates all show start times for the day based on the "Frequency" setting (e.g., every 20 mins).
2.  **Assignment:** It iterates through each employee (`A1`, `A2`, etc.).
3.  **Pattern:** Each employee follows a strict pattern: **Show (30m) → Gap (5m) → Ocean (20m) → Floor -1 (20m)**.
4.  **Staggering:** Employee `A1` starts at the first show. `A2` starts at the second, and so on.
5.  **Looping:** After finishing "Floor -1", the employee looks for the next available Show start time and repeats the cycle until their shift ends.
6.  **Triggers:** The schedule recalculates instantly whenever you change the Configuration (times, frequency) or Shift times.

### 2️⃣ How Green Team Scheduling Works

The Green Team schedule is **randomized** and **constraint-based**. Every time you click "Re-Shuffle", you get a different valid schedule.

**How rotations are generated:**
1.  **Rotations:** The day is divided into 5 fixed rotations (e.g., 09:00-10:30, 10:30-12:00).
2.  **Pool Creation:** For each rotation, the system identifies who is available (checking Shift Exceptions and Side Tasks).
3.  **Manual Locks:** Any staff member you have dragged-and-dropped to a specific spot is assigned *first* and locked in.
4.  **Scoring & Assignment:** The remaining staff are shuffled randomly. The system then assigns them to empty slots based on a "Score" system:
    *   **+ Points (Bad):** If they did the same station recently (Nuclear penalty for consecutive repeats).
    *   **+ Points (Bad):** If they have already done the Planetarium (Strict 1-per-day limit).
    *   **- Points (Good):** If they just came from the Museum (Prioritizes moving them to an active role).
    *   The system picks the "best" candidate (lowest score) for each slot.
5.  **Priority:** Critical stations (Ticket, Greeter) are filled before less critical ones (Museum).

**Drag & Drop:**
When you drag a person, it creates a "Forced Assignment". The system locks that person into that slot and then **re-shuffles everyone else** around them to ensure rules are still met.

### 3️⃣ What rules are currently enforced

**Strict Rules:**
*   **No Consecutive Repeats:** A staff member will effectively *never* be assigned the same station twice in a row (unless there are literally no other people available).
*   **Planetarium Limit:** A staff member will only be assigned to the Planetarium **once per day**.
*   **Off-Shift Handling:** Staff with "Shift Exceptions" (custom hours) are strictly not assigned during their off times.

**Soft Rules (Preferences):**
*   **Variety:** The system prefers to rotate staff to stations they haven't done recently (Gap of 2 rotations).
*   **Museum Exit:** Staff leaving the Museum (break/float) are prioritized for active stations next.

### 4️⃣ What is stored locally

The system uses your browser's **Local Storage** to save everything.
*   **Persistence:** Your data is saved instantly after every change. If you refresh the page or close the browser, your schedule, names, and configuration will be there when you return.
*   **Data:** It stores Team Assignments (Blue/Green), Employee Names, Shift configurations, Locked positions, and Manual overrides.
*   **Backup:** You can manually "Export" this data to a JSON file and "Import" it later to restore a specific state.

### 5️⃣ Current Limitations

*   **ID-Based History:** The system tracks history based on the **Slot ID** (`B1`, `B2`), not the **Person Name**. If you swap "Alice" (was B1) with "Bob" (was B2) halfway through the day, "Alice" essentially "becomes" B2 and inherits B2's history (e.g., if B2 already did Planetarium, Alice won't get it, even if she hasn't done it yet).
*   **Blue Team Rigidity:** The Blue Team logic is a fixed mathematical pattern. It does not account for "Breaks" or "Variety" beyond the fixed cycle.
*   **API Crash Risk:** The "Analyze Schedule" feature will crash the application if the AI API Key is not configured in the environment.
