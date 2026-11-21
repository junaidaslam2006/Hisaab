// Scores one parse against an eval case: exact operation match, false writes, must-not rules.
// Customer resolution mirrors ledger.matchCustomer on the WhatsApp path (exact name/alias tiers, no fuzzy guess),
// so "right" here means "the ledger would write to the right khata".

export const WRITE_TYPES = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'undo', 'correct', 'set_phone', 'create_list', 'move_to_list'])
const NOTHING_TYPES = new Set(['chitchat', 'unclear', 'help'])
const MONEY_TYPES = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'correct'])
const SETTLE_TYPES = new Set(['payment', 'supplier_payment'])
const PERSON_TYPES = new Set(['credit', 'payment', 'purchase', 'supplier_payment', 'balance', 'set_phone', 'move_to_list'])
const NAMELESS_UNLESS_SAID = new Set(['undo', 'correct', 'reminder'])
const SCOPED_QUERIES = new Set(['dues_list', 'total_due', 'full_ledger'])

const rawName = s => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')

export function makeScorer({ normalizeName, normalizeUrdu }) {
  function resolve(op, roster) {
    const list = roster.customers
    if (op.customer_id) {
      const byId = list.find(c => c.id === op.customer_id)
      if (byId) return { id: byId.id }
    }
    const name = op.customer_name
    const n = normalizeName(name)
    const u = normalizeUrdu(op.customer_name_urdu || (/[a-z]/i.test(String(name ?? '')) ? '' : name))
    const raw = rawName(name)
    if (!n && !u && !raw) return { none: true }
    const aliases = c => c.aliases || []
    const tiers = [
      c => raw && rawName(c.name) === raw,
      c => raw && aliases(c).some(a => rawName(a) === raw),
      c => n && normalizeName(c.name) === n,
      c => u && c.name_urdu && normalizeUrdu(c.name_urdu) === u,
      c => n && aliases(c).some(a => normalizeName(a) === n),
      c => u && aliases(c).some(a => normalizeUrdu(a) === u),
    ]
    for (const test of tiers) {
      const hits = list.filter(test)
      if (hits.length === 1) return { id: hits[0].id }
      if (hits.length > 1) return { ambiguous: hits.map(h => h.id) }
    }
    return { isNew: true, n, u }
  }

  const LIST_STOP = new Set(['list', 'lists', 'ki', 'ka', 'ke', 'wale', 'walay', 'walon', 'waale', 'wali', 'walo', 'group', 'khata', 'the', 'my', 'mein', 'log', 'لسٹ', 'والے', 'والوں', 'والی', 'کی', 'کا', 'کے'])
  const normList = s =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z؀-ۿ\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w && !LIST_STOP.has(w))
      .map(w => w.replace(/s$/, ''))
      .join(' ')

  function listVariants(spec, roster) {
    if (typeof spec === 'string') {
      const l = roster.lists.find(x => x.id === spec)
      return l ? [l.name, l.name_urdu, ...(l.aliases || [])].filter(Boolean) : [spec]
    }
    return spec
  }
  const listMatches = (got, spec, roster) => {
    const g = normList(got)
    return Boolean(g) && listVariants(spec, roster).some(v => normList(v) === g)
  }
  const supplierList = (got, roster) => roster.lists.some(l => l.kind === 'suppliers' && normList(l.name) === normList(got))

  function opMatches(exp, got, roster) {
    if (!exp.type.split('|').includes(got.type)) return false
    const t = got.type
    const who = resolve(got, roster)
    if (exp.c) {
      if (who.id !== exp.c) return false
    } else if (exp.new) {
      if (!who.isNew || !exp.new.some(v => normalizeName(v) === who.n)) return false
    } else if (NAMELESS_UNLESS_SAID.has(t) || PERSON_TYPES.has(t)) {
      if (!who.none) return false
    }
    if (MONEY_TYPES.has(t) && (got.amount ?? null) !== (exp.amount ?? null)) return false
    if (SETTLE_TYPES.has(t) && Boolean(got.full_settlement) !== Boolean(exp.full)) return false
    if (t === 'dues_list' && (got.threshold || 0) !== (exp.threshold || 0)) return false
    if (t === 'set_phone' && String(got.phone || '').replace(/\D/g, '').slice(-10) !== String(exp.phone).replace(/\D/g, '').slice(-10)) return false

    const wantsSuppliers = exp.list_kind === 'suppliers'
    if (t === 'create_list') {
      if (!listMatches(got.list_name, exp.list, roster)) return false
      if ((got.list_kind || 'customers') !== (exp.list_kind || 'customers')) return false
    } else if (t === 'move_to_list') {
      if (!listMatches(got.list_name, exp.list, roster)) return false
    } else if (SCOPED_QUERIES.has(t) || (t === 'reminder' && !exp.c)) {
      if (exp.list) {
        if (!listMatches(got.list_name, exp.list, roster)) return false
      } else if (wantsSuppliers) {
        if (got.list_kind !== 'suppliers' && !supplierList(got.list_name, roster)) return false
      } else if (got.list_name || got.list_kind === 'suppliers') return false
    } else if ((t === 'credit' || t === 'payment') && who.isNew) {
      if (exp.list ? !listMatches(got.list_name, exp.list, roster) : Boolean(got.list_name)) return false
    } else if ((t === 'purchase' || t === 'supplier_payment') && who.isNew && exp.list) {
      if (!listMatches(got.list_name, exp.list, roster)) return false
    }
    return true
  }

  /** Largest matching between expected and predicted ops (small n, so plain backtracking). */
  function bestMatching(expected, predicted, roster) {
    let best = { count: -1, used: new Set() }
    const used = new Set()
    const walk = (i, count) => {
      if (count + (expected.length - i) <= best.count) return
      if (i === expected.length) {
        if (count > best.count) best = { count, used: new Set(used) }
        return
      }
      for (let j = 0; j < predicted.length; j++) {
        if (used.has(j) || !opMatches(expected[i], predicted[j], roster)) continue
        used.add(j)
        walk(i + 1, count + 1)
        used.delete(j)
      }
      walk(i + 1, count)
    }
    walk(0, 0)
    return best
  }

  /**
   * `alt` (optional): other operation lists that leave the ledger in the same state, e.g. "suit 3600, 2000 advance"
   * as credit 3600 + payment 2000 or as one credit of 1600. The case passes when `expect` or any `alt` matches;
   * the reported score is the first exact one, else the closest.
   */
  function scoreCase(testCase, roster, ops) {
    if (!Array.isArray(testCase.alt) || !testCase.alt.length) return scoreOne(testCase, roster, ops)
    const tries = [testCase.expect, ...testCase.alt].map(expect => scoreOne({ ...testCase, expect }, roster, ops))
    return tries.find(s => s.ok) || tries.reduce((a, b) => (b.missing + b.extra < a.missing + a.extra ? b : a))
  }

  function scoreOne(testCase, roster, ops) {
    const predicted = ops || []
    const mustNot = testCase.must_not || []
    const violations = []
    for (const rule of mustNot) {
      const [kind, value] = rule.split(':')
      if (kind === 'write' && predicted.some(o => WRITE_TYPES.has(o.type))) violations.push(rule)
      if (kind === 'customer' && predicted.some(o => resolve(o, roster).id === value)) violations.push(rule)
      if (kind === 'type' && predicted.some(o => o.type === value)) violations.push(rule)
    }
    if (testCase.expect === 'nothing') {
      const extra = predicted.filter(o => !NOTHING_TYPES.has(o.type))
      return {
        ok: extra.length === 0 && !violations.length,
        falseWrites: extra.filter(o => WRITE_TYPES.has(o.type)).length,
        missing: 0,
        extra: extra.length,
        violations,
      }
    }
    // A greeting next to real work ("Assalam o alaikum, Umar ne 500…") is harmless noise.
    const considered = predicted.filter(o => o.type !== 'chitchat')
    const { count, used } = bestMatching(testCase.expect, considered, roster)
    const unmatched = considered.filter((_, j) => !used.has(j))
    return {
      ok: count === testCase.expect.length && unmatched.length === 0 && !violations.length,
      falseWrites: unmatched.filter(o => WRITE_TYPES.has(o.type)).length,
      missing: testCase.expect.length - count,
      extra: unmatched.length,
      violations,
    }
  }

  return { scoreCase, resolve }
}
