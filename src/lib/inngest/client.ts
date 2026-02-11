import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "ember",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
