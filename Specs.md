# Software Requirements Specification: Transaction Analyzer

## 1. Project Overview
The Transaction Analyzer is a local-first web application designed to help users visualize and manage their personal finances. Users can upload a bank transaction CSV, view data in a filterable table, and analyze spending patterns through a Chart.js-powered dashboard.

---

## 2. Technical Stack
| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | Svelte 5 (utilizing Runes: `$state`, `$derived`, `$effect`) |
| **Data Visualization** | Chart.js |
| **CSV Parsing** | PapaParse |
| **Local Database** | Dexie.js (IndexedDB wrapper) |
| **Styling** | Tailwind CSS |

---

## 3. Functional Requirements

### 3.1 Data Ingestion & Mapping
- **CSV Import**: Support for importing transaction files (e.g., `trans-example.csv`) [cite: 3].
- **Category Lookup**: Use a secondary reference file (`data/categories.csv`) to map transaction categories to metadata [cite: 4].
- **Relational Logic**:
    - Mapping key: `transactions.Category` -> `categories.Label` [cite: 3, 4].
    - Auto-computed fields: `Transaction Type`, `Category Group`, and `Affect Cash Flow` [cite: 4].

### 3.2 Transaction Explorer (Table View)
- **Data Display**: Show all core columns including `Date`, `Note`, `Value`, `Currency Code`, and `Category` [cite: 3].
- **Dynamic Filtering**:
    - Search by `Note` text.
    - Filter by `Category Group` or `Account Name`.
    - Date range selection based on the `Statement` or `Date` column.
- **Sorting**: Multi-column sorting for `Value` and `Date`.

### 3.3 Analytics Dashboard
- **Spending Breakdown**: A doughnut chart visualizing total value per `Category Group`.
- **Cash Flow Analysis**: A bar chart displaying monthly trends, filtered by transactions where `Affect Cash Flow` is `true` [cite: 4].
- **Key Metrics**: Display cards for "Total Expense," "Total Income," and "Net Cash Flow."

---

## 4. Data Schema

### 4.1 Transaction Object (from CSV)
| Field | Type | Description |
| :--- | :--- | :--- |
| `Transaction ID` | String | Unique identifier |
| `Date` | Date/ISO | Transaction timestamp |
| `Note` | String | Transaction description |
| `Value` | Float | Transaction amount |
| `Category` | String | Link to category mapping |
| `Account Name` | String | Source account (e.g., OCBC 365) |

### 4.2 Category Mapping (from Reference)
| Field | Type | Description |
| :--- | :--- | :--- |
| `Label` | String | Primary Key (matches Transaction Category) |
| `Transaction Type` | Enum | Expense / Income |
| `Category Group` | String | High-level grouping (e.g., Shopping, Bills) |
| `Affect Cash Flow` | Boolean | Determines if included in net totals |

---

## 5. Development Milestones
1. **M1: Parser & DB Setup**: Implement PapaParse and Dexie stores.
2. **M2: Svelte 5 Reactivity**: Create `$derived` runes for data filtering and mapping logic.
3. **M3: Table UI**: Build the responsive data grid with Tailwind CSS.
4. **M4: Dashboard**: Integrate Chart.js components with reactive updates.