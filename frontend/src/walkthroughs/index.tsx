import type { WalkthroughDef } from "@/components/walkthrough/parts";
import { trashWar } from "./trashWar";
import { partner } from "./partner";
import { organizer } from "./organizer";
import { attendee } from "./attendee";
import { touchGrass } from "./touchGrass";
import { solarpunk } from "./solarpunk";
import { admin } from "./admin";
import { welcome } from "./welcome";
import { teamEvents } from "./teamEvents";
import { eventOrganizer } from "./eventOrganizer";
import { rewards } from "./rewards";
import { funding } from "./funding";

/**
 * Registry of every walkthrough. Add a flow by creating a data file next to this one and listing it here.
 * Ids are persisted in localStorage as "seen" flags, so never rename one after it ships.
 */
export const WALKTHROUGHS = {
  "trash-war": trashWar,
  partner,
  organizer,
  attendee,
  "touch-grass": touchGrass,
  solarpunk,
  admin,
  welcome,
  "team-events": teamEvents,
  "event-organizer": eventOrganizer,
  rewards,
  funding,
} satisfies Record<string, WalkthroughDef>;

export type WalkthroughId = keyof typeof WALKTHROUGHS;
