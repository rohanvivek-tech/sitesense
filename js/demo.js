// Demonstration workspace. Every project here is fictional and illustrative, labelled "Demo",
// and removable from Settings. It is not real project data from any developer.

function buildDemoWorkspace() {
  const now = new Date().toISOString();
  const id = () => Store.uid();
  const R = (cause, status, explanation, evidence = '', action = '') => ({ cause, status, explanation, evidence, action });
  const L = (category, estimate, actual, extra = {}) => ({ id: id(), category, sourceName: catLabel(category), estimate, revised: null, committed: null, actual, forecast: null, period: '', complete: null, reason: null, flags: [], ...extra });
  const P = (meta, costLines, extra = {}) => ({ id: id(), demo: true, createdAt: now, updatedAt: now, meta: { benchmarkIds: null, escalationPct: null, specification: '', notes: '', ...meta }, assumptions: {}, costLines, imports: [], updates: [], scenarios: [], source: { sample: true, fileName: 'Demonstration data' }, ...extra });

  const A = P({ name: 'Demo · Tech Park A, Outer Ring Road', status: 'completed', developmentType: 'Grade-A office', location: 'Outer Ring Road, Bengaluru', areaSqft: 420000, originalBudget: 254.1, startDate: '2019-04', completionDate: '2022-06', durationMonths: 38, priceBasisYear: 2019, specification: 'Core and shell, unitised glazing, two basements' }, [
    L('land', 70, 70),
    L('approvals', 14.0, 16.8, { reason: R('approval', 'confirmed', 'Revised fire NOC conditions added a staircase and sprinkler upgrades.', 'Fire NOC correspondence (illustrative)', 'Pre-application meeting with the fire department on later projects') }),
    L('design', 6.3, 6.6),
    L('siteprep', 4.2, 5.9, { reason: R('site', 'confirmed', 'Hard rock at about 4 m needed controlled blasting and extra excavation.', 'Geotechnical report addendum (illustrative)', 'Deeper soil investigation before tender') }),
    L('substructure', 16.8, 19.1, { reason: R('site', 'investigating', 'Raft thickened after the rock profile changed; quantities still being reconciled with the contractor.') }),
    L('superstructure', 50.4, 57.5, { reason: R('material', 'confirmed', 'TMT steel rates rose between tender and procurement.', 'Supplier invoices (illustrative)', 'Price-variation clause in later contracts') }),
    L('facade', 16.8, 17.4),
    L('mep', 29.4, 33.8, { reason: R('design', 'confirmed', 'HVAC redesigned for a higher tenant occupancy density.', 'Design change note DCN-12 (illustrative)') }),
    L('finishes', 12.6, 12.2),
    L('external', 4.2, 4.0),
    L('prelims', 8.4, 10.9, { reason: R('delay', 'confirmed', 'Programme extended by five months, extending site establishment and staff costs.') }),
    L('marketing', 3.0, 2.8),
    L('finance', 18.0, 21.5, { reason: R('delay', 'confirmed', 'Longer construction period kept the loan outstanding for longer.') }),
  ]);

  const B = P({ name: 'Demo · Office Block B, Whitefield', status: 'completed', developmentType: 'Grade-A office', location: 'Whitefield, Bengaluru', areaSqft: 280000, originalBudget: 161.3, startDate: '2020-01', completionDate: '2023-03', durationMonths: 38, priceBasisYear: 2020, specification: 'Core and shell, single basement' }, [
    L('land', 48, 48),
    L('approvals', 9.5, 9.9),
    L('design', 4.3, 4.5),
    L('siteprep', 2.9, 2.8),
    L('substructure', 11.0, 11.6, { reason: R('quantity', 'investigating', 'Foundation quantities appear under-measured in the tender BOQ.') }),
    L('superstructure', 34.2, 37.3, { reason: R('material', 'confirmed', 'Steel and cement rate revisions during the frame works.', 'Rate revision letters (illustrative)') }),
    L('facade', 11.5, 12.6, { reason: R('variation', 'confirmed', 'Variation orders for an upgraded glazing specification.', 'VO-07, VO-09 (illustrative)') }),
    L('mep', 20.4, 21.6, { reason: R('other', 'unknown', 'Not yet established.') }),
    L('finishes', 8.6, 8.4),
    L('external', 2.9, 3.1),
    L('prelims', 5.8, 6.9, { reason: R('delay', 'investigating', 'Possible extension linked to monsoon disruption; under review.') }),
    L('marketing', 2.2, 2.0),
  ]);

  const C = P({ name: 'Demo · IT Campus C, Electronic City', status: 'completed', developmentType: 'Grade-A office', location: 'Electronic City, Bengaluru', areaSqft: 650000, originalBudget: 253.0, startDate: '2020-06', completionDate: '2024-01', durationMonths: 43, priceBasisYear: 2020, specification: 'Three towers, warm shell, podium parking' }, [
    L('approvals', 18.0, 18.4),
    L('design', 9.5, 9.8),
    L('siteprep', 6.0, 6.2),
    L('substructure', 25.5, 26.0),
    L('superstructure', 79.0, 87.7, { reason: R('material', 'confirmed', 'Steel price increase during the 2021–22 frame programme.') }),
    L('facade', 25.0, 27.0, { reason: R('design', 'investigating', 'Facade panel redesign; cost impact still being agreed.') }),
    L('mep', 46.0, 47.4),
    L('finishes', 19.5, 19.0),
    L('external', 7.0, 7.9, { reason: R('scope', 'confirmed', 'Additional internal roads and a second STP added at client request.') }),
    L('prelims', 13.0, 14.6, { reason: R('delay', 'confirmed', 'Phased handover extended site overheads.') }),
    L('marketing', 4.5, 4.4),
  ]);

  const D = P({ name: 'Demo · Retail Mall D, Hebbal', status: 'completed', developmentType: 'Retail / mall', location: 'Hebbal, Bengaluru', areaSqft: 380000, originalBudget: 119.0, startDate: '2021-01', completionDate: '2024-06', durationMonths: 42, priceBasisYear: 2021, specification: 'Anchor-led mall, extensive MEP and fit-out' }, [
    L('superstructure', 42.0, 44.0),
    L('mep', 38.0, 45.0, { reason: R('design', 'confirmed', 'Anchor tenant requirements changed the HVAC and fire design.') }),
    L('finishes', 30.0, 36.0, { reason: R('scope', 'confirmed', 'Upgraded common-area finishes.') }),
    L('prelims', 9.0, 10.5),
  ]);

  const E = P({ name: 'Demo · Office Tower E, Hebbal', status: 'active', developmentType: 'Grade-A office', location: 'Hebbal, Bengaluru', areaSqft: 310000, originalBudget: 134.3, startDate: '2023-07', completionDate: '2026-12', durationMonths: 42, priceBasisYear: 2023, specification: 'Core and shell, two basements' }, [
    L('approvals', 11.0, 11.6, { complete: true }),
    L('design', 5.2, 4.1, { forecast: 5.6 }),
    L('siteprep', 3.4, 3.9, { complete: true, reason: R('site', 'confirmed', 'High water table required continuous dewatering.') }),
    L('substructure', 13.5, 14.2, { complete: true, reason: R('site', 'confirmed', 'Dewatering and additional waterproofing in the basements.') }),
    L('superstructure', 42.0, 30.5, { forecast: 45.1, committed: 44.0, reason: R('material', 'investigating', 'Rebar and ready-mix revisions in 2025; forecast based on current commitments.') }),
    L('facade', 13.9, 2.1, { committed: 13.6 }),
    L('mep', 25.0, 6.0),
    L('finishes', 10.5, null),
    L('prelims', 7.2, 5.0, { forecast: 7.9, reason: R('delay', 'investigating', 'Three-month slip in the frame programme being assessed.') }),
    L('marketing', 2.6, null),
  ]);

  const prop = P({ name: 'Demo · Proposed Whitefield Grade-A Office', status: 'proposed', developmentType: 'Grade-A office', location: 'Whitefield, Bengaluru', areaSqft: 260000, originalBudget: 165.8, startDate: '2027-01', completionDate: '2029-06', durationMonths: 30, priceBasisYear: 2026, specification: 'Core and shell, single basement, unitised glazing', notes: 'Feasibility prepared on current market rates. Construction estimate from the internal cost plan, not yet benchmarked.' }, [
    L('land', 45, null), L('approvals', 12, null), L('design', 6, null), L('siteprep', 2.6, null), L('substructure', 9.9, null),
    L('superstructure', 33.6, null), L('facade', 10.4, null), L('mep', 24.1, null), L('finishes', 9.6, null), L('external', 2.6, null),
    L('prelims', 6.0, null), L('marketing', 4.0, null),
  ], {
    assumptions: { ...SAMPLE_ASSUMPTIONS, name: 'Demo · Proposed Whitefield Grade-A Office' },
  });
  prop.updates.push({
    id: id(), label: 'Pre-commitment price check', date: Store.today(), commit: 'pre', milestone: 0, steel: 18, cement: 10, labour: 8, delay: 4,
    drivers: {
      steel: { text: 'TMT rebar quotes are about 18% above the rate used in the cost plan.', source: 'Supplier quotes (illustrative)', approved: false },
      cement: { text: 'Ready-mix quotes are about 10% higher than budgeted.', source: 'RMC quotes (illustrative)', approved: false },
      labour: { text: 'Labour contractor rates up after a regional shortage.', source: '', approved: false },
      delay: { text: 'Approval timeline risk could push completion by four months.', source: '', approved: false },
    },
  });
  prop.scenarios.push(
    { id: id(), name: 'Construction +10%', cons: 10, steel: 0, cement: 0, labour: 0, delay: 0, rentChg: 0, rateChg: 0 },
    { id: id(), name: 'Six-month delay', cons: 0, steel: 0, cement: 0, labour: 0, delay: 6, rentChg: 0, rateChg: 0 },
    { id: id(), name: 'Rent 10% lower', cons: 0, steel: 0, cement: 0, labour: 0, delay: 0, rentChg: -10, rateChg: 0 },
    { id: id(), name: 'Interest +1.5 pts', cons: 0, steel: 0, cement: 0, labour: 0, delay: 0, rentChg: 0, rateChg: 1.5 },
  );
  return [prop, E, A, B, C, D];
}
