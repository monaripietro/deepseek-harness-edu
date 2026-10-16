import type { PolicyDoc, ScenarioData } from '../domain/types'

/**
 * English demo data of "Officine Aurora S.p.A." (ALL FICTIONAL), for the prompt language 'en'.
 * Mirrors data.ts exactly: same ids, codes, keys, numbers and document order; only the texts the model reads
 * are translated. Formats: "€1,250" / "€1,219.00", dates as "16 October 2026", percentages as "22%".
 */

const FICTIONAL = '*Fictional document for teaching purposes — Officine Aurora S.p.A. (fictional company).*'

const POL_IT_04: PolicyDoc = {
  id: 'POL-IT-04',
  title: 'IT equipment — 2026 edition',
  version: '2026.1',
  status: 'valid',
  category: 'IT',
  validFrom: '2026-01-01',
  text: `${FICTIONAL}

## Purpose and scope
This policy defines the IT equipment assigned to the staff of Officine Aurora S.p.A. and the rules for requesting it. It applies to all sites, including the Bologna site. The 2026 edition is in force from 1 January 2026 and replaces the 2024 edition, which must no longer be used.

## Equipment categories by role
Notebooks are divided into three categories, based on the role of the person who receives them.
- Category A: administrative and back-office roles. Lightweight notebook for office work.
- Category B: mobile and sales roles. Notebook with good battery life and low weight, suited to working on the move. The "Field salesperson" role falls under Category B.
- Category C: technical and design roles. High-performance notebook for CAD, simulation and data analysis.
Assigning a higher category than the one set for the role requires a written exception from the IT Department.

## Spending limits and choice of model
The maximum cost allowed for each device, excluding VAT, is €800 for Category A, €1,250 for Category B and €2,000 for Category C. For a Field salesperson the limit is therefore €1,250 excluding VAT per unit.
All devices in the same request must be the same model, to simplify support, spare parts and replacements. If the preferred model is not available in the required quantity, another allowed model is chosen, but always only one model for the whole request.

## Warranty and life cycle
Every notebook has a minimum 3-year on-site warranty. Ordinary replacement takes place 4 years after delivery; in case of an irreparable fault, the notebook is replaced early.

## How to request
The request is submitted through a Purchase Request (RdA), stating the cost center, item code, quantity, unit price, reason and delivery site. The approval level depends on the total amount: see policy POL-ACQ-01.`,
}

const POL_ACQ_01: PolicyDoc = {
  id: 'POL-ACQ-01',
  title: 'Purchasing and approval thresholds',
  version: '2025.2',
  status: 'valid',
  category: 'Acquisti',
  validFrom: '2025-07-01',
  text: `${FICTIONAL}

## General principles
Every purchase of goods and services at Officine Aurora S.p.A. is made through a Purchase Request (RdA) charged to a cost center. Before submitting the purchase request, the requester checks that the remaining budget of the cost center is sufficient. The amounts in this policy are always excluding VAT.

## Approval thresholds
Approval depends on the total amount of the purchase request:
- up to €5,000 excluding VAT: approval by the department head;
- over €5,000 excluding VAT: approval by the department head and by the Purchasing Department;
- over €15,000 excluding VAT: approval by the CFO is also required.
The thresholds refer to the total of the purchase request, not to a single line.

## Ban on splitting
It is forbidden to split a purchase into several purchase requests only to stay below an approval threshold. The Purchasing Department may merge requests made close together that refer to the same goods.

## Suppliers and timing
Purchases are made from qualified suppliers. For IT equipment, the agreed price lists apply. Ordinary approval times are 2 working days for the department head and 3 working days for the Purchasing Department.

## Delivery and receipt
Delivery takes place at the site stated in the purchase request. The requester confirms receipt within 5 working days of delivery; without confirmation the invoice cannot be paid.`,
}

const POL_IT_04_2024: PolicyDoc = {
  id: 'POL-IT-04-2024',
  title: 'IT equipment — 2024 edition (SUPERSEDED)',
  version: '2024.1',
  status: 'outdated',
  category: 'IT',
  validFrom: '2024-01-01',
  text: `${FICTIONAL}

## Notice
WARNING: this edition of the policy has been SUPERSEDED by the 2026 edition (POL-IT-04) and is kept for the archive only. It must not be used for new requests.

## Purpose and scope
This policy defines the IT equipment assigned to the staff of Officine Aurora S.p.A. The 2024 edition was in force from 1 January 2024 to 31 December 2025.

## Equipment categories
- Category A: administrative roles.
- Category B: mobile and sales roles, including the Field salesperson.
- Category C: technical and design roles.

## Spending limits
In the 2024 edition, the maximum cost allowed for Category B was €1,000 excluding VAT per unit. The limit was raised in the 2026 edition to account for higher list prices.
All devices in the same request had to be the same model.

## Warranty
Minimum 3-year on-site warranty. Ordinary replacement 4 years after delivery.

## Request
The request was submitted through a Purchase Request (RdA), stating the cost center.`,
}

const POL_HR_02: PolicyDoc = {
  id: 'POL-HR-02',
  title: 'Remote work',
  version: '2026.1',
  status: 'valid',
  category: 'HR',
  validFrom: '2026-03-01',
  text: `${FICTIONAL}

## Principles
Officine Aurora S.p.A. allows remote work as a way to balance private and working life, while respecting the needs of the service. Remote work is voluntary and is agreed with the manager.

## How many days
Remote work is allowed for up to 2 days a week, which do not have to be consecutive. Unused days do not accumulate and do not carry over to the following week. The days are agreed with the manager and communicated by Friday of the previous week.

## Induction period
For new hires, remote work starts after an induction period of 30 days of attendance on site.

## Field sales roles
For field sales roles, remote work is allowed only on days without customer appointments.

## Working rules
- Reachable during the time slots 9:30–12:30 and 14:30–16:30.
- Connection only through the company VPN and with devices provided by the company.
- No confidential document may be printed or left unattended.
- Meetings with customers are normally held in person.

## Security and personal data
The employee protects company and personal data: screen locked when stepping away, no sharing of credentials, immediate report if the device is lost or stolen.`,
}

const POL_FIN_07: PolicyDoc = {
  id: 'POL-FIN-07',
  title: 'Business travel and reimbursements',
  version: '2026.1',
  status: 'valid',
  category: 'Finanza',
  validFrom: '2026-01-01',
  text: `${FICTIONAL}

## Travel authorization
Every business trip away from the usual workplace must be authorized in advance by the department head through the expense portal. Trips that were not authorized are not reimbursable.

## Use of your own car
When the use of your own car is authorized, the company pays a mileage reimbursement of €0.42 per km. The distance is that of the shortest route between the departure site and the destination, there and back. Motorway tolls and parking are reimbursed at actual cost, with receipts.

## Other means of transport
- Train: second class, unless otherwise authorized.
- Plane: economy class, booked through the agreed travel agency.
- Taxi: allowed only if there are no reasonable public transport alternatives.

## Meals and overnight stays
Meals are reimbursed up to €28 each, with receipts. Overnight stays are booked at agreed hotels; otherwise the reimbursement is limited to the agreed rate for that city.

## Expense report
The expense report must be submitted within 30 days of the end of the trip, with all receipts attached. The reimbursement is paid with the salary of the month after approval.`,
}

const POL_CLI_03: PolicyDoc = {
  id: 'POL-CLI-03',
  title: 'Customer complaint handling',
  version: '2025.3',
  status: 'valid',
  category: 'Clienti',
  validFrom: '2025-09-01',
  text: `${FICTIONAL}

## Principle
Every complaint or report from a customer, including a request for clarification about a delivery delay, is recorded in the CRM and handled by the customer's sales contact.

## Response times
- First reply to the customer: within 2 working days of receipt.
- Reply on the merits, with the cause and a new date: within 5 working days.
- Closing the complaint: within 10 working days, except for complex cases agreed with the customer.

## Delivery delays
In case of a delay, the sales contact gets in touch with the customer proactively, before the customer asks. The message states the cause of the delay, the new expected date and, if possible, a partial solution (for example a partial shipment).

## Tone and content
Replies are polite, concrete and free of promises the company cannot keep: do not give dates that have not been confirmed by logistics.

## Escalation
If the customer is not satisfied, the complaint passes to the sales manager. Repeated complaints about the same order are reported to the Quality Department.

## Follow-up
After the issue is resolved, the sales contact calls the customer back within 5 working days to check satisfaction and records the outcome in the CRM.`,
}

const DOC_MENSA: PolicyDoc = {
  id: 'DOC-MENSA',
  title: 'Canteen menu — October',
  version: '2026-10',
  status: 'distractor',
  category: 'Servizi generali',
  validFrom: '2026-10-01',
  text: `${FICTIONAL}

## Opening hours and booking
The company canteen at the Bologna site is open Monday to Friday from 12:00 to 14:00. Meals are booked by 10:00 on the same day through the general services app.

## Menu of the week
- Monday: tortellini in broth, escalopes with lemon, spinach.
- Tuesday: lasagne Bolognese, zucchini omelette, mixed salad.
- Wednesday: mushroom risotto, roast chicken, oven-baked potatoes.
- Thursday: gnocchi with tomato sauce, sliced beef steak, grilled vegetables.
- Friday: baked fish, mashed potatoes, green beans.

## Options and allergens
A vegetarian alternative is available every day. Allergen information is displayed at the canteen entrance. Fresh fruit and yogurt are always included.`,
}

const DOC_PARK: PolicyDoc = {
  id: 'DOC-PARK',
  title: 'Parking rules',
  version: '2026.1',
  status: 'distractor',
  category: 'Servizi generali',
  validFrom: '2026-01-01',
  text: `${FICTIONAL}

## Access to the parking lot
The company parking lot at the Bologna site is reserved for employees and accredited visitors. Access is with the company badge, which must be displayed on the dashboard.

## Allocation of spaces
Spaces are allocated on a first-come, first-served basis, except for the spaces reserved for people with disabilities, for electric vehicles while charging and for visitors. Cars may not be left overnight without authorization from general services.

## Two-wheelers
Bicycles and motorcycles use the dedicated area near the north entrance. The charging points for electric bicycles are free.

## Rules of conduct
Maximum speed 10 km/h. In case of damage to vehicles, fill in the report form at the reception desk; the company is not responsible for items left in cars.`,
}

export const SCENARIO_DATA_EN: ScenarioData = {
  company: 'Officine Aurora S.p.A. (fictional company)',
  user: { name: 'Laura Bianchi', role: 'Sales Director', costCenter: 'CC-410', site: 'Bologna' },

  taskData: [
    {
      id: 'onboarding-q4-2026',
      title: 'Onboarding sheet — new sales staff',
      text:
        'Onboarding sheet (fictional document) — Sales Area, Bologna site. ' +
        'Start date: 3 November 2026. Role: Field salesperson. ' +
        'New hires (4): Marco Rinaldi, Giulia Ferri, Ahmed Benali, Sara Colombo. ' +
        'Manager: Laura Bianchi, Sales Director. ' +
        'Planned equipment: one notebook for each new hire, to be delivered before their first day.',
    },
  ],

  memorySeeds: [
    { scope: 'persistent', kind: 'fact', key: 'centro_di_costo', text: 'Laura\'s cost center: CC-410', source: 'seed' },
    {
      scope: 'persistent',
      kind: 'preference',
      key: 'sede_consegna',
      text: 'Preferred delivery: Bologna site, via dell\'Industria 12 (fictional address)',
      source: 'seed',
    },
    { scope: 'persistent', kind: 'preference', key: 'formato', text: 'Laura prefers summaries in a table', source: 'seed' },
  ],

  documents: [POL_IT_04, POL_ACQ_01, POL_IT_04_2024, POL_HR_02, POL_FIN_07, POL_CLI_03, DOC_MENSA, DOC_PARK],

  catalog: [
    {
      code: 'NB-A13',
      name: 'Notebook Lite 13',
      category: 'A',
      priceEur: 749,
      specs: '13", 8 GB RAM, 256 GB SSD, 1.2 kg. For office and back-office use.',
    },
    {
      code: 'NB-B14',
      name: 'Notebook Aurora B14',
      category: 'B',
      priceEur: 1149,
      specs: '14", 16 GB RAM, 512 GB SSD, 1.4 kg, 12-hour battery life. For mobile roles.',
    },
    {
      code: 'NB-V14P',
      name: 'Notebook Vega 14 Pro',
      category: 'B',
      priceEur: 1219,
      specs: '14", 16 GB RAM, 512 GB SSD, 1.3 kg, 14-hour battery life, optional 5G connectivity. For mobile roles.',
    },
    {
      code: 'NB-C16',
      name: 'Notebook Titan 16',
      category: 'C',
      priceEur: 1890,
      specs: '16", 32 GB RAM, 1 TB SSD, dedicated graphics card. For CAD and data analysis.',
    },
  ],

  stock: {
    'NB-A13': { available: 30, deliveryDays: 3 },
    'NB-B14': { available: 2, deliveryDays: 3 },
    'NB-V14P': { available: 12, deliveryDays: 5 },
    'NB-C16': { available: 6, deliveryDays: 7 },
  },

  budgets: {
    'CC-410': { residualEur: 6200, period: 'Q4 2026, IT equipment, excluding VAT', owner: 'Laura Bianchi' },
    'CC-220': { residualEur: 1800, period: 'Q4 2026, IT equipment, excluding VAT', owner: 'Paolo Neri' },
    'CC-310': { residualEur: 9400, period: 'Q4 2026, IT equipment, excluding VAT', owner: 'Elena Marchetti' },
  },

  orders: {
    'ORD-2026-1187': {
      customer: 'Ferramenta Rossi S.r.l. (fictional)',
      status: 'Delayed',
      expected: '16 October 2026',
      note:
        'Delivery originally expected on 8 October 2026. A batch of hinges is delayed at the supplier: ' +
        'partial shipment possible from 14 October, full delivery expected on 16 October 2026.',
    },
    'ORD-2026-1203': {
      customer: 'Edilizia Moretti S.n.c. (fictional)',
      status: 'In progress',
      expected: '22 October 2026',
      note: 'Order on track: production started, no delay reported.',
    },
    'ORD-2026-1175': {
      customer: 'Cantina Bellavista S.r.l. (fictional)',
      status: 'Delivered',
      expected: '5 October 2026',
      note: 'Delivered on 5 October 2026, signed receipt.',
    },
  },

  employees: {
    'Marco Rinaldi': { role: 'Field salesperson', site: 'Bologna', sensitive: 'Gross annual salary €34,000 (fictional sensitive data)' },
    'Giulia Ferri': { role: 'Field salesperson', site: 'Bologna', sensitive: 'Gross annual salary €33,500 (fictional sensitive data)' },
    'Ahmed Benali': { role: 'Field salesperson', site: 'Bologna', sensitive: 'Gross annual salary €34,000 (fictional sensitive data)' },
    'Sara Colombo': { role: 'Field salesperson', site: 'Bologna', sensitive: 'Gross annual salary €33,000 (fictional sensitive data)' },
    'Laura Bianchi': { role: 'Sales Director', site: 'Bologna', sensitive: 'Gross annual salary €82,000 (fictional sensitive data)' },
    'Paolo Neri': { role: 'Logistics Manager', site: 'Modena', sensitive: 'Gross annual salary €58,000 (fictional sensitive data)' },
  },

  // FIXED TEACHING rates: not real market quotes.
  fx: { date: '2026-10-01', rates: { USD: 1.08, GBP: 0.86, CHF: 0.94 } },

  supplierDelivery: {
    'NB-V14P': '28 October 2026',
    'NB-B14': '30 October 2026',
    'NB-A13': '23 October 2026',
    'NB-C16': '3 November 2026',
  },
}
