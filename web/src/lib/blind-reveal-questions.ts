// Blind Reveal questions: one prompt, two private answers, opened together.
//
// Every question here asks the answerer to say something they'd hesitate to
// say first. Explicit on purpose. The first entry is the default prompt the
// Blind Reveal screen opens with; "Another question" cycles through the rest.
// Works with no AI configured, which matters for self-hosted instances.

export const BLIND_REVEAL_QUESTIONS: readonly string[] = [
  "The filthiest thing you've been quietly turning over but never said out loud.",
  "What's something you want me to do to you that you've never asked for?",
  "Describe the best sex we've ever had, in detail. What made it that good?",
  "What do you think about when you get yourself off?",
  "What's one thing you'd want to try if you knew I'd say yes?",
  "Where do you most want my mouth that I don't spend enough time?",
  "What's a porn scene or story that's stuck with you, and why?",
  "What do you wish I said to you during sex?",
  "What's something you've been too shy to admit turns you on?",
  "If you could have me any way you wanted tonight, how would it go?",
  "What's one thing I do in bed that you'd want more of?",
  "What's one thing you'd quietly like me to stop doing, or do differently?",
  "What's the dirtiest thing you've ever thought about me in public?",
  "What's a fantasy about other people you've never told me?",
  "When do you feel most wanted by me?",
  "What's something you liked with someone before me that you miss?",
  "If you were in charge for a whole night, what would you make me do?",
  "What part of your body do you most want worshipped?",
  "What's the one position you think about most?",
  "What's a kink you're curious about but nervous to try?",
  "What turns you off, even if I've never noticed?",
  "What's the last thing that made you horny out of nowhere?",
  "Write the text you'd send me right now if you weren't holding back.",
  "What do you want me to never, ever do?",
];

export const DEFAULT_BLIND_REVEAL_QUESTION = BLIND_REVEAL_QUESTIONS[0];

// The next question after `current`, wrapping around. A custom question the
// user typed starts the cycle from the top.
export function nextBlindRevealQuestion(current: string): string {
  const index = BLIND_REVEAL_QUESTIONS.indexOf(current.trim());
  return BLIND_REVEAL_QUESTIONS[(index + 1) % BLIND_REVEAL_QUESTIONS.length];
}
