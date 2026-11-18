/* Dave's first-use tour stays focused on the mobile MVP workflows. */
export const TOUR = [
  { screen: 'home', target: 'home', title: 'Welcome to FleetPilot', body: "I'm Dave. I'll show you the main steps: enter a record, save it, and find it again." },
  { screen: 'home', target: 'fab', title: 'Enter a record', body: 'Tap + to choose a rental, booking, payment or expense. The mobile form keeps FleetPilot’s familiar field layout.' },
  { screen: 'rentals', target: 'recordsHead', title: 'Save and find records', body: 'After saving, new entries take you to their records list. Rentals also show what is out and what is due back.' },
  { screen: 'performance', target: 'performance', title: 'Performance', body: 'Review rental results, income, fuel and net figures. Use the filters to focus on a period, vehicle or rental type.' },
  { screen: 'fuel', target: 'fuel', title: 'Fuel', body: 'Track fuel fills and top-ups, check the Ola balance, and inspect the fuel ledger.' },
  { screen: 'coop', target: 'coop', title: 'Coop', body: 'Review Coop lines, dates, kilometres and totals. Add or complete a line from this screen.' }
];
