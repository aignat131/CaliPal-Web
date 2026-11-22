import { describe, it, expect } from 'vitest'
import {
  MILESTONE_TREE, MILESTONE_BY_ID, TOTAL_MILESTONES, branchProgress, sanitizeMilestones, totalDone, milestoneLabel,
} from '../tree'

describe('milestone tree', () => {
  it('has unique ids across all branches', () => {
    const ids = MILESTONE_TREE.flatMap(b => b.steps.map(s => s.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(TOTAL_MILESTONES).toBe(ids.length)
    expect(new Set(MILESTONE_TREE.map(b => b.id)).size).toBe(MILESTONE_TREE.length)
  })

  it('indexes every milestone with its branch and position', () => {
    const e = MILESTONE_BY_ID.get('fl_straddle')!
    expect(e.branch.id).toBe('front_lever')
    expect(e.branch.steps[e.index].id).toBe('fl_straddle')
  })

  it('sanitizes stored data', () => {
    expect(sanitizeMilestones({ pull_1: 5, nope: 3, push_1: 'x', dips_1: -1 })).toEqual({ pull_1: 5 })
    expect(sanitizeMilestones(null)).toEqual({})
    expect(totalDone({ pull_1: 1, push_1: 2, bogus: 3 })).toBe(2)
  })

  it('computes branch progress: next = first unticked, best = highest ticked', () => {
    const pull = MILESTONE_TREE.find(b => b.id === 'pull')!
    expect(branchProgress(pull, {})).toMatchObject({ done: 0, next: pull.steps[0], best: null })
    const p = branchProgress(pull, { pull_dead_hang: 1, pull_scap: 1, pull_1: 1 })
    expect(p.done).toBe(3)
    expect(p.next?.id).toBe('pull_rows')
    expect(p.best?.id).toBe('pull_1')
    const all = Object.fromEntries(pull.steps.map(s => [s.id, 1]))
    expect(branchProgress(pull, all).next).toBeNull()
  })

  it('formats labels', () => {
    expect(milestoneLabel({ id: 'x', name: 'L-sit', target: '10 sec' })).toBe('L-sit · 10 sec')
    expect(milestoneLabel({ id: 'x', name: 'L-sit' })).toBe('L-sit')
  })
})
