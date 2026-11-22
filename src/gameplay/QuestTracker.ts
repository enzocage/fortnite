import type { GameModeId, MatchQuest } from '../types';
import { EventBus, mulberry32 } from '../core';

export type QuestEventKind =
  | 'chest_open'
  | 'damage_dealt'
  | 'elimination'
  | 'slurp_break'
  | 'weapon_upgrade'
  | 'campfire_ignite'
  | 'vehicle_distance';

interface QuestTemplate {
  kind: QuestEventKind;
  title: string;
  target: number;
  blitzTarget?: number;
  xpReward: number;
}

interface ActiveQuestEntry {
  kind: QuestEventKind;
  rawProgress: number;
  quest: MatchQuest;
}

const QUEST_POOL: readonly QuestTemplate[] = [
  {
    kind: 'chest_open',
    title: 'Search Chests or Supply Drops',
    target: 3,
    blitzTarget: 2,
    xpReward: 150,
  },
  {
    kind: 'damage_dealt',
    title: 'Deal Damage to Opponents',
    target: 250,
    blitzTarget: 175,
    xpReward: 200,
  },
  {
    kind: 'elimination',
    title: 'Eliminate Opponents',
    target: 2,
    blitzTarget: 2,
    xpReward: 250,
  },
  {
    kind: 'slurp_break',
    title: 'Smash Slurp Barrels',
    target: 2,
    blitzTarget: 2,
    xpReward: 150,
  },
  {
    kind: 'weapon_upgrade',
    title: 'Upgrade a Weapon at a Bench',
    target: 1,
    blitzTarget: 1,
    xpReward: 175,
  },
  {
    kind: 'campfire_ignite',
    title: 'Stoke a Cozy Campfire',
    target: 1,
    blitzTarget: 1,
    xpReward: 150,
  },
  {
    kind: 'vehicle_distance',
    title: 'Travel Distance in a Vehicle',
    target: 150,
    blitzTarget: 100,
    xpReward: 175,
  },
];

function hashMode(mode: GameModeId): number {
  switch (mode) {
    case 'zero_build':
      return 1013;
    case 'blitz':
      return 2029;
    case 'duos':
      return 3049;
    case 'solo':
    default:
      return 17;
  }
}

export class QuestTracker {
  private eventBus: EventBus;
  private activeQuests: ActiveQuestEntry[] = [];

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.reset(4201, 'solo');
  }

  reset(seed = 4201, mode: GameModeId = 'solo'): void {
    const combinedSeed = ((seed >>> 0) ^ hashMode(mode)) >>> 0;
    const rng = mulberry32(combinedSeed);

    const pool = [...QUEST_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    const picked = pool.slice(0, 3);
    this.activeQuests = picked.map((tpl) => {
      const target =
        mode === 'blitz' && tpl.blitzTarget !== undefined
          ? tpl.blitzTarget
          : tpl.target;
      return {
        kind: tpl.kind,
        rawProgress: 0,
        quest: {
          id: `quest_${tpl.kind}`,
          title: tpl.title,
          progress: 0,
          target,
          completed: false,
          xpReward: tpl.xpReward,
        },
      };
    });
  }

  record(kind: QuestEventKind, amount = 1): boolean {
    if (amount <= 0 || !Number.isFinite(amount)) return false;

    let completedNow = false;
    for (let i = 0; i < this.activeQuests.length; i++) {
      const entry = this.activeQuests[i];
      if (entry.kind !== kind || entry.quest.completed) continue;

      entry.rawProgress = Math.min(entry.quest.target, entry.rawProgress + amount);
      entry.quest.progress = Math.min(
        entry.quest.target,
        Math.floor(entry.rawProgress + 1e-6),
      );

      if (entry.rawProgress >= entry.quest.target - 1e-6) {
        entry.quest.progress = entry.quest.target;
        entry.quest.completed = true;
        completedNow = true;
        this.eventBus.emit('ui:quest_complete', {
          quest: { ...entry.quest },
        });
        this.eventBus.emit('sound:play', {
          id: 'quest_complete',
        });
      }
    }
    return completedNow;
  }

  getQuests(): MatchQuest[] {
    return this.activeQuests.map((entry) => ({ ...entry.quest }));
  }

  getCompletedCount(): number {
    let count = 0;
    for (let i = 0; i < this.activeQuests.length; i++) {
      if (this.activeQuests[i].quest.completed) count += 1;
    }
    return count;
  }

  getCompletedBonusXp(): number {
    let xp = 0;
    for (let i = 0; i < this.activeQuests.length; i++) {
      if (this.activeQuests[i].quest.completed) {
        xp += this.activeQuests[i].quest.xpReward;
      }
    }
    return xp;
  }
}
