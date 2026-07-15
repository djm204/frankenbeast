import { describe, expect, it } from 'vitest';
import { CapacityReservationPolicy } from '../../../src/beasts/services/capacity-reservation-policy.js';

describe('CapacityReservationPolicy', () => {
  it('keeps the reserved security slot unavailable to normal backlog work', () => {
    const policy = new CapacityReservationPolicy({
      totalSlots: 4,
      reservations: [{ id: 'security-urgent', slots: 1, labels: ['security'], categories: ['availability'] }],
    });

    const runningBacklog = [
      { id: 'backlog-1', labels: ['feature'] },
      { id: 'backlog-2', labels: ['feature'] },
      { id: 'backlog-3', labels: ['reliability'] },
    ];

    expect(policy.canStart({ id: 'backlog-4', labels: ['feature'] }, runningBacklog)).toEqual({
      allowed: false,
      reason: 'reserved_capacity_only',
      reservationId: undefined,
    });
    expect(policy.canStart({ id: 'security-fix', labels: ['security'] }, runningBacklog)).toEqual({
      allowed: true,
      reason: 'reserved_capacity_available',
      reservationId: 'security-urgent',
    });
  });

  it('allows normal work to use a reserved slot only when the reservation is explicitly released', () => {
    const policy = new CapacityReservationPolicy({
      totalSlots: 4,
      releasedReservationIds: ['security-urgent'],
      reservations: [{ id: 'security-urgent', slots: 1, labels: ['security'] }],
    });

    const runningBacklog = [
      { id: 'backlog-1', labels: ['feature'] },
      { id: 'backlog-2', labels: ['feature'] },
      { id: 'backlog-3', labels: ['feature'] },
    ];

    expect(policy.canStart({ id: 'backlog-4', labels: ['feature'] }, runningBacklog)).toMatchObject({
      allowed: true,
      reason: 'released_reserved_capacity_available',
    });
  });

  it('renders operator-visible reservation state with used and free reserved capacity', () => {
    const policy = new CapacityReservationPolicy({
      totalSlots: 5,
      reservations: [
        { id: 'security-urgent', slots: 2, labels: ['security'], categories: ['availability'] },
      ],
    });

    const state = policy.describe([
      { id: 'normal-1', labels: ['feature'] },
      { id: 'security-1', labels: ['security'] },
    ]);

    expect(state).toEqual({
      totalSlots: 5,
      usedSlots: 2,
      freeSlots: 3,
      normalSlots: { total: 3, used: 1, free: 2 },
      reservations: [
        {
          id: 'security-urgent',
          slots: 2,
          used: 1,
          free: 1,
          released: false,
          labels: ['security'],
          categories: ['availability'],
        },
      ],
    });
  });
});
