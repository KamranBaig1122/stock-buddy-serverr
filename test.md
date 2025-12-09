# StockBuddy API Test Playbook

A structured checklist for validating every backend feature, mapping endpoints to the proposal requirements, and illustrating how to exercise real-world workflows (including the warehouse/manager scenarios).

---

## 0. Prerequisites

- Node server running on `http://localhost:5000`.
- MongoDB accessible and the `.env` file configured with `PORT`, `MONGODB_URI`, `JWT_SECRET`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `FCM_SERVER_KEY`, `FRONTEND_URL`.
- Tooling: Postman/Insomnia (recommended) or `curl`.
- One admin JWT (create via `/api/auth/register` or preset seed user).

Headers for authenticated requests:

```
Authorization: Bearer <JWT>
Content-Type: application/json
```

---

## 1. Authentication & User Requirements

| Requirement | Endpoint | Test Steps | Dependencies |
|-------------|----------|------------|--------------|
| Secure login, role-based access, password reset (Req. 4.1) | `/api/auth/*`, `/api/users/*` | See below | None |

### 1.1 Register User (`POST /api/auth/register`)
1. Body: `{ "email": "...", "password": "Pass123!", "name": "Admin User", "role": "admin" }`.
2. Expect `201` with `token` and user payload.
3. Map: *Req. 4.1 (user creation)*.

### 1.2 Login (`POST /api/auth/login`)
1. Body: `{ "email": "...", "password": "Pass123!", "noti": "<optional FCM token>" }`.
2. Expect `200` plus JWT.
3. Map: *Req. 4.1 (secure login, notification token capture)*.

### 1.3 OTP Forgot Password (`POST /api/auth/forgot-password`)
1. Body: `{ "email": "registered@example.com" }`.
2. Expect `200`; check email inbox/log for OTP.
3. Map: *Req. 4.1 password reset via OTP + email notifications*.

### 1.4 Reset Password (`POST /api/auth/reset-password`)
1. Body: `{ "email": "...", "otp": "<OTP>", "newPassword": "NewPass123!" }`.
2. Expect `200`.
3. Map: *Req. 4.1 secure reset with expiry*.

### 1.5 Get Profile (`GET /api/auth/profile`)
1. Provide JWT.
2. Expect user details.
3. Map: *Req. 4.1 role visibility*.

### 1.6 User Management (Admin only)
- **List Users** `GET /api/users`
- **Create User** `POST /api/users`
- **Update User** `PUT /api/users/:id`
- **Reset User Password** `POST /api/users/:id/reset-password`

Test: perform CRUD operations with admin JWT.  
Map: *Req. 4.1 (role & account control), 4.10 user management*.

Dependencies: login token; `requireAdmin` middleware.

---

## 2. Locations (Req. 4.6, 4.3 locations in stock tracking)

### 2.1 Create Location (`POST /api/locations`)
1. Body: `{ "name": "Main Warehouse", "address": "123 Supply Ave" }`.
2. Expect `201`.

### 2.2 Get Locations (`GET /api/locations`)
1. Expect array with `isActive`.

### 2.3 Update Location (`PUT /api/locations/:id`)
1. Modify `name`, `address`, `isActive`.

Dependencies: Admin JWT. Items/stock later reference `locationId`.

---

## 3. Item & Barcode Features (Req. 4.3, 4.7)

### 3.1 Create Item (`POST /api/items`)
1. Body: `{ "name": "Glass Cleaner 1 gal", "sku": "GLC-001", "unit": "gallon", "threshold": 5 }`.
2. Expect `201`.

### 3.2 Assign Barcode (`POST /api/items/:id/barcode`)
1. Body options:
   - Generate: `{ }`.
   - Custom: `{ "barcode": "UPC-1234", "overwrite": true }`.
2. Expect `200`.

### 3.3 Get Items (`GET /api/items`)
1. Expect populated locations, `totalStock`, `stockStatus`.

### 3.4 Search Items (`GET /api/items/search?query=glass`)

### 3.5 Get Item by ID (`GET /api/items/:id`)

### 3.6 Get by Barcode (`GET /api/items/barcode/:barcode`)

### 3.7 Update Item (`PUT /api/items/:id`)

Map: *Req. 4.3 item management features; Req. 4.7 barcode scan & generation*.

Dependencies: Admin role for create/update/assign; item IDs used in stock, repairs, disposals.

---

## 4. Stock Management (Req. 4.4)

### 4.1 Add Stock (`POST /api/stock/add`)
1. Body: `{ "itemId": "<item>", "locationId": "<warehouse>", "quantity": 4, "note": "Initial case", "photo": "<optional>" }`.
2. Expect `201` with `transaction.type === "ADD"`.
3. Notifications (FCM/email) fire if configured.

### 4.2 Transfer Stock (`POST /api/stock/transfer`)
1. Staff example: from `warehouse` to `building1`.
2. With staff JWT expect `status: "pending"`.
3. With admin JWT expect immediate `status: "approved"` and adjusted stock.

### 4.3 Review Transfer (`POST /api/stock/transfer/review`) — **Admin**
1. Body: `{ "transactionId": "...", "approved": true, "note": "Release approved" }`.
2. Expect inventory move and notifications.
3. Reject path: set `"approved": false`.

### 4.4 Pending Transfers (`GET /api/stock/transfers/pending`) — **Admin**

### 4.5 Stock by Location (`GET /api/stock/location/:locationId`)
1. View per-site quantity & `status` field (low vs sufficient).

Map: *Req. 4.4 add/transfer, approvals, audit trail, per-location tracking*.

Dependencies: Items & locations exist; transfers rely on `Transaction` documents.

---

## 5. Repair Management (Req. 4.5)

### 5.1 Send for Repair (`POST /api/repairs/send`)
1. Body includes location, quantity, vendor, optional `serialNumber`, `photo`.
2. Stock decreases immediately; `REPAIR_OUT` transaction created.

### 5.2 Return from Repair (`POST /api/repairs/return`)
1. Body: `{ "repairTicketId": "...", "locationId": "<warehouse or site>", "note": "Back in service" }`.
2. Stock restored, ticket status becomes `returned`, `REPAIR_IN` transaction created.

### 5.3 Get Repair Tickets (`GET /api/repairs`)

Map: *Req. 4.5 track repairs, vendor info, audit logs, notifications*.

Dependencies: Items & locations; requires tokens for auth; uses `RepairTicket` IDs produced by `/send`.

---

## 6. Disposal Management (Req. 4.6)

### 6.1 Request Disposal (`POST /api/disposals/request`)
1. Body must include `photo` (base64).
2. Expect `pending` transaction.

### 6.2 Approve/Reject Disposal (`POST /api/disposals/approve`) — **Admin**
1. Body: `{ "transactionId": "...", "approved": true }`.
2. Approved path reduces stock, triggers notifications, logs approver.
3. Reject path leaves stock unchanged, sends rejection notification.

### 6.3 Pending Disposals (`GET /api/disposals/pending`) — **Admin**

Map: *Req. 4.6 disposal approvals, photos, audit trail*.

Dependencies: Items & stock must exist; admin rights for approvals.

---

## 7. Dashboard & Transactions (Req. 4.2, 4.9)

### 7.1 Dashboard Summary (`GET /api/dashboard`)
- Confirms totals, low stock count, pending repairs/disposals, recent transactions.
- Validates performance target (<3s) by measuring latency.

### 7.2 Transaction History (`GET /api/transactions`)
- Query with `type`, `status`, `date range`, pagination.
- Map to *Req. 4.9 audit log*.

### 7.3 Transaction Detail (`GET /api/transactions/:id`)
- Verify populates item, locations, creator, approver.

---

## 8. Notification Channels (Req. 4.8, 4.11)

- **Push**: Provide valid FCM tokens via `/api/auth/login` `noti` field. Trigger events (add stock, transfer approvals, repairs, disposals) and confirm FCM receives payloads.
- **Email**: Ensure `EMAIL_USER` + `EMAIL_APP_PASSWORD` valid. Inspect outbox for password reset emails & workflow notifications.
- Map: *Req. 4.8 multi-channel alerts*, *4.11 base64 image handling (photo data stored on Transaction/RepairTicket)*.

Dependencies: Gmail app password, Firebase server key.

---

## 9. Requirement Traceability Matrix

| Proposal Section | Requirement Fulfilled | Primary Endpoints |
|------------------|-----------------------|-------------------|
| 4.1 Authentication & Roles | Secure login, password reset, roles | `/api/auth/*`, `/api/users/*`, middleware `authenticateToken`, `requireAdmin` |
| 4.2 Dashboard | Inventory overview | `/api/dashboard` |
| 4.3 Item Management | CRUD, thresholds, location stock | `/api/items`, `/api/items/:id`, `/api/items/barcode/:barcode`, `/api/items/:id/barcode` |
| 4.4 Stock Management | Add/transfer stock, approvals, audit | `/api/stock/add`, `/api/stock/transfer`, `/api/stock/transfer/review`, `/api/stock/transfers/pending`, `/api/stock/location/:locationId` |
| 4.5 Repair Management | Send/return, vendor tracking | `/api/repairs/*` |
| 4.6 Disposal Management | Photo proof, approvals | `/api/disposals/*` |
| 4.7 Barcode Features | Generate, assign, scan | `/api/items/:id/barcode`, `/api/items/barcode/:barcode` |
| 4.8 Notifications | Push + email alerts | Triggered via stock/repair/disposal + password reset |
| 4.9 Audit & Transaction Log | Full history | `/api/transactions` |
| 4.10 User Management | Admin controls | `/api/users/*` |
| 4.11 Image Handling | Base64 storage | `photo` fields in relevant endpoints |
| 6 Hosting Plan | `.env` settings for DB/FCM/email | README `.env` section |

---

## 10. Dependency Tree (High-Level)

```
Authentication
├─ /api/auth/login → Issues JWT, stores noti token
├─ /api/auth/profile → Requires valid JWT
└─ Admin-only endpoints → requireAdmin middleware

Locations
└─ Required by Item locations & stock transfers

Items
├─ Provides itemId for stock, repairs, disposals
├─ Barcode endpoints depend on Item record
└─ Threshold logic feeds dashboard low-stock alerts

Stock
├─ /add → needs Item + Location + authenticated user
├─ /transfer → depends on existing stock from `/add`
└─ /transfer/review → depends on pending transactions

Repairs
└─ Requires Item + Location stock state; produces tickets used by /repairs/return

Disposals
└─ Requires Item + stock; approvals adjust stock & audit log

Dashboard
└─ Aggregates data from Items, Transactions, RepairTickets
```

---

## 11. Scenario Walkthroughs

### 11.1 Warehouse Receipt & Site Transfer (Vacuums)
1. **Receive shipment**  
   `POST /api/stock/add` (item = vacuum, location = warehouse, quantity = 5).
2. **Manager A picks up 2 vacuums**  
   `POST /api/stock/transfer` (warehouse → Building 1, quantity = 2).  
   - Staff role → admin approval via `/api/stock/transfer/review`.  
   - Admin role → immediate move.
3. **Redistribute from Building 1 to Building 3**  
   `POST /api/stock/transfer` (Building 1 → Building 3, quantity = 1) + optional admin review.
4. **Verify final counts**  
   `GET /api/stock/location/<warehouse>` → shows 3 vacuums.  
   `GET /api/stock/location/<building1>` → shows 1 vacuum.  
   `GET /api/stock/location/<building3>` → shows 1 vacuum.  
5. **Audit log**  
   `GET /api/transactions?type=TRANSFER` to review both moves.

### 11.2 Case Versus Singles (Glass Cleaner)
1. **Create item** `POST /api/items` for “Glass Cleaner – 1 gal”.
2. **Assign barcode** `POST /api/items/:id/barcode` (auto generate).
3. **Receive a case of four** `POST /api/stock/add` with `quantity: 4`.
4. **Manager pulls one gallon** `POST /api/stock/transfer` with `quantity: 1` to their building.
5. **Check remaining stock** using `/api/stock/location/:warehouseId`.

### 11.3 Repair Cycle (Equipment)
1. Send to repair: `POST /api/repairs/send` (decrements stock, logs `REPAIR_OUT`).
2. Return from repair: `POST /api/repairs/return` (increments stock, logs `REPAIR_IN`).
3. History: `GET /api/repairs` (tickets) & `GET /api/transactions?type=REPAIR_OUT`.

### 11.4 Disposal with Photo Proof
1. Request: `POST /api/disposals/request` with base64 image, reason.
2. Admin approval: `POST /api/disposals/approve` (reduces stock, logs approver) or reject.
3. Dashboard pending disposals count decreases after approval.

### 11.5 Low-Stock Alerts
1. Set item `threshold` to 3.
2. After transfers reduce quantity ≤3, system sends push/email notifications (if credentials provided).
3. Verify `GET /api/dashboard` shows item under `lowStockItems`.

---

## 12. Tips for Automated Testing

- Use Postman environments for base URL and JWT variables. Chain requests:
  1. Register/login → save `{{JWT}}`.
  2. Create location, item → store IDs.
  3. Run stock/repair/disposal flows using saved variables.
- For regression, script `npm run build` followed by integration tests seeded with fixtures.

---

### Completion Criteria

- All endpoints respond with expected status and payloads.
- Audit logs reflect every operation (ADD, TRANSFER, REPAIR_OUT/IN, DISPOSE).
- Dashboard matches the state implied by individual resource endpoints.
- Notifications (if configured) are received for stock changes, approvals, and repairs.

Use this document as a step-by-step validation plan to demonstrate full compliance with the StockBuddy proposal. 

