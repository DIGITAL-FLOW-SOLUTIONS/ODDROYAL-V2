We are now implementing the **Betting Slip and Betting Engine** for our betting site project.  
The following requirements must be implemented step by step with full functionality.  

---

### 🔹 1. Betting Slip Functionality  

- Add a **Betting Slip** (already positioned in the UI — just integrate functionality).  
- Must support 3 modes:  
  - **Ordinary** (single bets).  
  - **Express** (multi-bets/accumulators).  
  - **System** (combination bets).  

- Functionality:  
  1. Odds Selection → When user clicks any odds from the line/live/match details pages, automatically add it to the betslip.  
  2. Smooth animations when bets are added/removed.  
  3. Ability to set stake per bet or global stake (for accumulators).  
  4. Auto-calculate **potential returns** dynamically (`stake * totalOdds`).  
  5. Skeleton loaders and loading indicators when fetching odds.  
  6. Notification system for bet confirmation (success/error).  

---

### 🔹 1.5 Bet Acceptance Engine (Back-End Logic)  

- Implement a **bet acceptance engine** with risk & liability management:  
  - Validate the betslip (no duplicate selections in the same market, min/max stake limits, odds still valid).  
  - Compute **exposure** (total potential liability of all open bets).  
  - Accept or reject bets accordingly.  
  - Store accepted bets in the database as **open bets**.  

- Database tables required:  
  - `users` → profile + wallet.  
  - `bets` → betslip details (user_id, selections, stake, totalOdds, type, status).  
  - `transactions` → deposits, withdrawals, bet stakes, winnings.  

---

### 🔹 2. Potential Winnings  

- Show **real-time potential winnings** in betslip as user enters stake:  
  - Formula for single bets: `stake * odds`.  
  - Formula for accumulators: `stake * (odds1 * odds2 * ... * oddsN)`.  
  - Formula for system bets: calculate all valid combinations and show possible ranges of winnings.  

---

### 🔹 3. Bet Settlement & Reconciliation  

- Implement automatic **settlement worker**:  
  - Fetch final results of matches from **SportMonks API** (or API-Football if needed for results).  
  - Update each bet selection as **won, lost, void**.  
  - Settle the bet: update bet status and calculate winnings.  
  - Update user’s wallet balance with winnings.  

---

### 🔹 4. User Profile, Wallet, Bet History, Results Page  

- **User Profile Page** → show wallet balance, transaction history, active/open bets, settled bets.  
- **Wallet** → store and update balances.  
- **Bet History Page** → show previous bets with results.  
- **Results Page** → display settled outcomes and match results (synced with API).  

---

### 🔹 5. Settlement Worker (Background Service)  

- Create a **worker/cron job** that:  
  - Runs every 1–5 minutes.  
  - Pulls results from API (`fixtures/{id}?include=results`).  
  - Settles bets automatically.  
  - Pushes payouts into wallet.  
  - Logs settlement in transactions table.  

---

### 🔹 6. Deposit/Withdrawal Placeholders  

- Add placeholders in wallet/profile for:  
  - **Deposit option** (future integration with payment gateway).  
  - **Withdrawal option** (future integration with payment providers).  
- For now, use manual balance adjustments (admin control).  

---

### 🔹 Technical Notes  

- All odds/fixtures should come from **SportMonks API**.  
- Betslip & engine must connect odds selections directly to the database.  
- Notifications (toasts/snackbars) for bet placement success/failure.  
- Ensure **modular structure** → UI for betslip, API services for odds/results, backend for bet processing.  
- Keep wallet operations **atomic** (transaction-safe) to avoid race conditions.  

---

👉 Final Goal:  
Users can:  
- Add bets to betslip.  
- Choose bet type (Ordinary/Express/System).  
- Enter stake and see potential winnings.  
- Place bet → Bet acceptance engine validates and stores.  
- Worker fetches results and settles bets.  
- Wallet updates with winnings/losses.  
- Profile/History pages display all past activity.  

---

⚡ Deliver this step by step, ensuring UI and backend are both implemented. Use best practices for database design and API integration.

