export type ThingType = "post" | "comment";

export type DecisionOutcome =
  | "approved"
  | "removed"
  | "locked"
  | "escalated"
  | "needs-second-review";

export type DecisionSource = "manual" | "onModAction" | "fixture";

export interface DecisionRecord {
  id: string;
  thingId: string;
  thingType: ThingType;
  ruleTag: string;
  outcome: DecisionOutcome;
  summary: string;
  template: string;
  keywords: string[];
  createdAt: string;
  expiresAt: string;
  actorLabel: string;
  source: DecisionSource;
  embedding?: number[];
}

export interface QueueItem {
  id: string;
  thingType: ThingType;
  title: string;
  body: string;
  authorLabel: string;
  reports: string[];
  ruleSignals: string[];
  createdAt: string;
  source: "fixture" | "reddit";
}

export interface RetentionSettings {
  days: number;
  storeActorLabels: boolean;
  fixtureMode: boolean;
  lastCleanupAt?: string;
}

export interface DecisionInput {
  thingId: string;
  thingType: ThingType;
  ruleTag: string;
  outcome: DecisionOutcome;
  summary: string;
  template: string;
  keywords: string[] | string;
  actorLabel?: string;
  retentionDays?: number;
  source?: DecisionSource;
}

export interface MatchResult {
  decision: DecisionRecord;
  score: number;
  reasons: string[];
  semantic?: number;
}
