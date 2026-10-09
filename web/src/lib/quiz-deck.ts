// The Sex Quiz deck — the static set of desire cards each partner rates.
//
// The server only ever stores ratings keyed by `id`; everything human-facing
// (label, emoji, copy, role/edge flags) lives here on the client. Cards are
// listed in deal order: gentle first, edge last, so the quiz eases couples in.
//
// - role: true  -> the card shows a Give / Receive / Both choice. Every card
//   written in first person ("…on me", "make me…") needs it, otherwise the
//   partner who'd be doing it has no honest way to answer.
// - edge: true  -> "edge" card. Carries a consent line; a Pass on an edge card
//   can be filed to Limits, and edge cards sort to the end of the deck.
//
// Voice: explicit and direct. This is an adult app and the cards say exactly
// what they mean.
//
// Ids are permanent. Stored ratings are keyed by id, so rewording a card keeps
// its id; a card that is folded into another or dropped moves its id to
// RETIRED_QUIZ_CARD_IDS and that id is never used again.

export type QuizInterest = "pass" | "curious" | "into";
export type QuizRole = "give" | "receive" | "both";

// Bumped whenever cards are added. Partners who answered an older deck get a
// "rate the new cards" prompt instead of a full retake.
export const QUIZ_DECK_VERSION = 2;

export interface QuizCard {
  id: string;
  category: string;
  label: string;
  emoji: string;
  desc: string;
  role: boolean;
  edge: boolean;
}

export interface QuizCategory {
  id: string;
  title: string;
}

export const QUIZ_CATEGORIES: QuizCategory[] = [
  { id: "warmup", title: "Warm-up & tease" },
  { id: "mouths", title: "Mouths, hands & tits" },
  { id: "positions", title: "Positions & places" },
  { id: "tempo", title: "Tempo & energy" },
  { id: "power", title: "Power play" },
  { id: "restraint", title: "Restraint & sensation" },
  { id: "roleplay", title: "Roleplay & games" },
  { id: "toys", title: "Toys & props" },
  { id: "watch", title: "Watching" },
  { id: "capture", title: "Nudes, sexting & filming" },
  { id: "words", title: "Dirty talk" },
  { id: "requests", title: "Do this to me" },
  { id: "cumplay", title: "Orgasms & cum" },
  { id: "anal", title: "Anal" },
  { id: "others", title: "Other people" },
  { id: "heavier", title: "Heavier kink" },
];

export const QUIZ_DECK: QuizCard[] = [
  // Warm-up & tease
  { id: "makeouts", category: "warmup", label: "Long, filthy makeouts", emoji: "💋", desc: "Kissing as the main event.", role: false, edge: false },
  { id: "massage", category: "warmup", label: "Sensual massage that doesn't stay sensual", emoji: "💆", desc: "Oil, hands, and wherever they wander.", role: true, edge: false },
  { id: "striptease", category: "warmup", label: "Striptease", emoji: "🔥", desc: "Undressing slowly while you watch.", role: true, edge: false },
  { id: "teasing", category: "warmup", label: "Tease me until I beg", emoji: "⏳", desc: "Edging, stopping, starting again.", role: true, edge: false },
  { id: "shower", category: "warmup", label: "Shower sex", emoji: "🚿", desc: "Wet, soapy, pressed against the tile.", role: false, edge: false },
  { id: "dryhump", category: "warmup", label: "Grinding with clothes on", emoji: "👖", desc: "Dry humping until it's not enough.", role: false, edge: false },
  { id: "undresseachother", category: "warmup", label: "Undress each other slowly", emoji: "🎀", desc: "One piece at a time.", role: true, edge: false },
  { id: "neckkissing", category: "warmup", label: "Neck and ear kissing", emoji: "👂", desc: "The spots that make me melt.", role: true, edge: false },
  { id: "lingerie", category: "warmup", label: "Lingerie reveal", emoji: "🩲", desc: "Dressed up to be torn off.", role: true, edge: false },
  { id: "stockings", category: "warmup", label: "Stockings and heels on during sex", emoji: "👠", desc: "Keep them on.", role: true, edge: false },

  // Mouths, hands & tits
  { id: "oral", category: "mouths", label: "Oral", emoji: "👅", desc: "Sucking cock or eating pussy.", role: true, edge: false },
  { id: "sixtynine", category: "mouths", label: "69", emoji: "😋", desc: "Mouths on each other at once.", role: false, edge: false },
  { id: "handwork", category: "mouths", label: "Handjob or fingering", emoji: "✋", desc: "Hands doing all the work.", role: true, edge: false },
  { id: "facesitting", category: "mouths", label: "Face-sitting", emoji: "🪑", desc: "Sit on my face.", role: true, edge: false },
  { id: "mutualmasturbation", category: "mouths", label: "Get ourselves off side by side", emoji: "🤲", desc: "Watching each other do it.", role: false, edge: false },
  { id: "wakemeup", category: "mouths", label: "Wake me up with your mouth", emoji: "🌙", desc: "Oral before I'm even awake.", role: true, edge: false },
  { id: "eatmeoutshaking", category: "mouths", label: "Eat me out until I'm shaking", emoji: "💦", desc: "Don't stop at the first one.", role: true, edge: false },
  { id: "mouthfingersher", category: "mouths", label: "Tongue and fingers on me at once", emoji: "👅", desc: "Mouth and hands together.", role: true, edge: false },
  { id: "gspot", category: "mouths", label: "Finger my G-spot", emoji: "👆", desc: "Come-hither until I lose it.", role: true, edge: false },
  { id: "ballplay", category: "mouths", label: "Ball play", emoji: "🍒", desc: "Licking and sucking my balls.", role: true, edge: false },
  { id: "titfuck", category: "mouths", label: "Fuck my tits", emoji: "🍈", desc: "Cock between them.", role: true, edge: false },
  { id: "nippleplay", category: "mouths", label: "Nipple play", emoji: "🌸", desc: "Sucking, licking, pinching.", role: true, edge: false },

  // Positions & places
  { id: "newposition", category: "positions", label: "Try a position we've never done", emoji: "🤸", desc: "Something new, tonight.", role: false, edge: false },
  { id: "frombehind", category: "positions", label: "From behind", emoji: "🍑", desc: "Doggy, bent over the table, or face-down flat.", role: false, edge: false },
  { id: "ontop", category: "positions", label: "Riding", emoji: "🤠", desc: "On top, facing me or facing away.", role: true, edge: false },
  { id: "standing", category: "positions", label: "Against the wall", emoji: "🧍", desc: "Standing, or picked up and carried.", role: false, edge: false },
  { id: "deepmissionary", category: "positions", label: "Deep missionary", emoji: "😮‍💨", desc: "Legs on shoulders, edge of the bed, as deep as it goes.", role: false, edge: false },
  { id: "spooning", category: "positions", label: "Spooning sex", emoji: "🥄", desc: "On our sides, tangled up.", role: false, edge: false },
  { id: "lotus", category: "positions", label: "Lotus", emoji: "🧘", desc: "Wrapped around each other, sitting up.", role: false, edge: false },
  { id: "piledriver", category: "positions", label: "Pile driver", emoji: "🤸", desc: "Hips up, legs over my head.", role: false, edge: false },
  { id: "quickie", category: "positions", label: "Quickie", emoji: "⚡", desc: "Fast, urgent, five minutes.", role: false, edge: false },
  { id: "morning", category: "positions", label: "Morning sex", emoji: "🌅", desc: "Before we get out of bed.", role: false, edge: false },
  { id: "notbed", category: "positions", label: "Anywhere but the bed", emoji: "🛋️", desc: "Couch, floor, kitchen counter.", role: false, edge: false },
  { id: "carsex", category: "positions", label: "Car sex", emoji: "🚗", desc: "Cramped and steamy.", role: false, edge: false },
  { id: "outdoors", category: "positions", label: "Outdoors", emoji: "🌲", desc: "Open air.", role: false, edge: false },
  { id: "hotel", category: "positions", label: "A hotel night just to fuck", emoji: "🏨", desc: "Fresh sheets, no one next door we know.", role: false, edge: false },
  { id: "nopanties", category: "positions", label: "No underwear when we go out", emoji: "🤫", desc: "A secret only you know about.", role: true, edge: false },
  { id: "semipublic", category: "positions", label: "Somewhere we could get caught", emoji: "🫣", desc: "Semi-public, heart pounding.", role: false, edge: true },

  // Tempo & energy
  { id: "slow", category: "tempo", label: "Slow and sensual", emoji: "🐢", desc: "Unhurried, drawn out.", role: false, edge: false },
  { id: "romantic", category: "tempo", label: "Passionate, eyes-open sex", emoji: "💞", desc: "Candles, eye contact, feeling it.", role: false, edge: false },
  { id: "tantric", category: "tempo", label: "Tantric", emoji: "👁️", desc: "Slow breath, locked eyes, hours.", role: false, edge: false },
  { id: "frantic", category: "tempo", label: "Frantic, clothes half-on", emoji: "🌪️", desc: "Can't wait long enough to undress.", role: false, edge: false },
  { id: "lazysex", category: "tempo", label: "Lazy, half-asleep sex", emoji: "😴", desc: "Barely moving.", role: false, edge: false },
  { id: "makeupsex", category: "tempo", label: "Make-up sex", emoji: "💢", desc: "The heat right after a fight.", role: false, edge: false },
  { id: "allnighter", category: "tempo", label: "All night", emoji: "🌙", desc: "No finish line.", role: false, edge: false },
  { id: "rough", category: "tempo", label: "Rough, hard sex", emoji: "🔥", desc: "More force, less gentle.", role: true, edge: true },

  // Power play
  { id: "control", category: "power", label: "Take control of me", emoji: "🎚️", desc: "One leads, one follows.", role: true, edge: false },
  { id: "orders", category: "power", label: "Give me orders", emoji: "🫡", desc: "Tell me what to do and I do it.", role: true, edge: false },
  { id: "begging", category: "power", label: "Make me beg for it", emoji: "🙏", desc: "Out loud, more than once.", role: true, edge: false },
  { id: "orgasmcontrol", category: "power", label: "I only cum when you say", emoji: "⏸️", desc: "Orgasm control.", role: true, edge: false },
  { id: "brat", category: "power", label: "Brat and tamer", emoji: "😼", desc: "Mouthing off until I get put in my place.", role: true, edge: false },
  { id: "worship", category: "power", label: "Worship my body", emoji: "🙇", desc: "Every inch, on your knees.", role: true, edge: false },
  { id: "daddy-dynamic", category: "power", label: "\"Daddy\" and \"good girl\" dynamic", emoji: "👑", desc: "Or \"good boy\". Either way round.", role: true, edge: false },
  { id: "pinned", category: "power", label: "Pin me down and fuck me", emoji: "✊", desc: "Held in place.", role: true, edge: true },
  { id: "cnc-ravish", category: "power", label: "Take me like I have no say", emoji: "😈", desc: "Consensual ravishment. The safeword is always real.", role: true, edge: true },
  { id: "freeuse", category: "power", label: "Free use", emoji: "🔓", desc: "Use me whenever you want, within our rules.", role: true, edge: true },
  { id: "chastity", category: "power", label: "Chastity, kept on edge", emoji: "🔒", desc: "Locked up or denied until you decide.", role: true, edge: true },

  // Restraint & sensation
  { id: "blindfold", category: "restraint", label: "Blindfolded", emoji: "🙈", desc: "Sight gone, maybe sound too.", role: true, edge: false },
  { id: "hairpulling", category: "restraint", label: "Hair pulling", emoji: "💁", desc: "A fistful while you fuck me.", role: true, edge: false },
  { id: "sensory", category: "restraint", label: "Sensory teasing", emoji: "🪶", desc: "Feathers, nails, ice, silk.", role: true, edge: false },
  { id: "tickling", category: "restraint", label: "Tickling", emoji: "😆", desc: "Squirming and helpless.", role: true, edge: false },
  { id: "footplay", category: "restraint", label: "Foot play", emoji: "🦶", desc: "Worship, footjobs, all of it.", role: true, edge: false },
  { id: "bondage", category: "restraint", label: "Tie me up", emoji: "🪢", desc: "Cuffs, rope, or tied to the bed.", role: true, edge: true },
  { id: "rope", category: "restraint", label: "Proper rope bondage", emoji: "🧵", desc: "Shibari, slow and tight.", role: true, edge: true },
  { id: "spanking", category: "restraint", label: "Spank me", emoji: "🖐️", desc: "Over your knee, or while I ride you.", role: true, edge: true },
  { id: "biting", category: "restraint", label: "Biting and marking", emoji: "🦷", desc: "Teeth, hickeys, marks that last.", role: true, edge: true },
  { id: "temperature", category: "restraint", label: "Wax or ice", emoji: "🧊", desc: "Heat and cold on skin.", role: true, edge: true },
  { id: "nippleclamps", category: "restraint", label: "Nipple clamps", emoji: "🗜️", desc: "That bite of pressure.", role: true, edge: true },
  { id: "gagged", category: "restraint", label: "Gag me", emoji: "🤐", desc: "A hand or a gag.", role: true, edge: true },
  { id: "breath", category: "restraint", label: "Choking", emoji: "🤏", desc: "A hand on the sides of the throat, never the front. Never drunk.", role: true, edge: true },

  // Roleplay & games
  { id: "roleplay", category: "roleplay", label: "Roleplay a scene", emoji: "🎭", desc: "Characters, a setup, a script.", role: false, edge: false },
  { id: "fantasyscene", category: "roleplay", label: "Act out my specific fantasy", emoji: "✨", desc: "The one I replay.", role: true, edge: false },
  { id: "costumes", category: "roleplay", label: "Costumes and uniforms", emoji: "👗", desc: "Dressed as someone else.", role: true, edge: false },
  { id: "pickup", category: "roleplay", label: "Strangers", emoji: "😏", desc: "Pick me up at a bar like we've never met.", role: false, edge: false },
  { id: "rp-teacher", category: "roleplay", label: "Teacher and student", emoji: "🍎", desc: "Stay after class.", role: true, edge: false },
  { id: "rp-boss", category: "roleplay", label: "Boss and assistant", emoji: "💼", desc: "Office-hours power.", role: true, edge: false },
  { id: "rp-doctor", category: "roleplay", label: "Doctor and patient", emoji: "🩺", desc: "A very thorough exam.", role: true, edge: false },
  { id: "rp-masseuse", category: "roleplay", label: "Massage with a happy ending", emoji: "💆", desc: "Masseuse and client.", role: true, edge: false },
  { id: "rp-firsttime", category: "roleplay", label: "Our first time again", emoji: "💘", desc: "Nervous and new.", role: false, edge: false },
  { id: "stripgame", category: "roleplay", label: "Strip poker, sex dice, dirty dares", emoji: "🎲", desc: "Lose and get naked.", role: false, edge: false },
  { id: "roleplayother", category: "roleplay", label: "Roleplay me with someone else", emoji: "🎭", desc: "Act out the story.", role: true, edge: true },
  { id: "petplay", category: "roleplay", label: "Pet play", emoji: "🐾", desc: "Collar, leash, kitten or pup.", role: true, edge: true },

  // Toys & props
  { id: "vibrator", category: "toys", label: "Vibrator", emoji: "📳", desc: "On me or on you.", role: true, edge: false },
  { id: "vibeduring", category: "toys", label: "A vibrator on me while you fuck me", emoji: "📳", desc: "Both at once.", role: true, edge: false },
  { id: "wand", category: "toys", label: "Wand", emoji: "🪄", desc: "The heavy-duty rumble.", role: true, edge: false },
  { id: "suctiontoy", category: "toys", label: "Clit sucker", emoji: "🌬️", desc: "Hands-free air-pulse toy.", role: true, edge: false },
  { id: "dildo", category: "toys", label: "Dildo", emoji: "🍆", desc: "Fuck me with it.", role: true, edge: false },
  { id: "stroker", category: "toys", label: "Stroker or sleeve", emoji: "🧴", desc: "A toy for my cock.", role: true, edge: false },
  { id: "cockring", category: "toys", label: "Cock ring", emoji: "💍", desc: "Harder, for longer.", role: true, edge: false },
  { id: "remotetoy", category: "toys", label: "Remote-control toy", emoji: "🎮", desc: "You hold the app, maybe in public.", role: true, edge: false },
  { id: "newtoy", category: "toys", label: "Buy a new toy together", emoji: "🎁", desc: "Something neither of us has tried.", role: false, edge: false },
  { id: "lube", category: "toys", label: "Lube, warming gels, massage oil", emoji: "💧", desc: "Slick everything.", role: false, edge: false },
  { id: "sexpillow", category: "toys", label: "Wedge, pillow, or sex swing", emoji: "📐", desc: "Better angles.", role: false, edge: false },
  { id: "foodplay", category: "toys", label: "Food play", emoji: "🍯", desc: "Whipped cream, honey, licked off.", role: true, edge: false },
  { id: "impacttoy", category: "toys", label: "Paddle, crop, or flogger", emoji: "🪵", desc: "A real impact tool.", role: true, edge: true },

  // Watching
  { id: "mirrors", category: "watch", label: "Fuck in front of a mirror", emoji: "🪞", desc: "Watch us.", role: false, edge: false },
  { id: "lightson", category: "watch", label: "Lights all the way on", emoji: "💡", desc: "Fully seen.", role: false, edge: false },
  { id: "watchporn", category: "watch", label: "Watch porn together", emoji: "📺", desc: "Put it on and copy it.", role: false, edge: false },
  { id: "erotica", category: "watch", label: "Audio porn or erotica, read out loud", emoji: "🎧", desc: "Filthy words in our ears.", role: false, edge: false },
  { id: "recreatescene", category: "watch", label: "Recreate a porn scene", emoji: "🎥", desc: "One we both liked.", role: false, edge: false },
  { id: "lapdance", category: "watch", label: "Lap dance", emoji: "💃", desc: "You sit still, I perform.", role: true, edge: false },

  // Nudes, sexting & filming
  { id: "sexting", category: "capture", label: "Send nudes, clips, and voice notes", emoji: "📱", desc: "Wherever we are.", role: true, edge: false },
  { id: "videosex", category: "capture", label: "Video sex when we're apart", emoji: "📞", desc: "Camera on, both of us.", role: false, edge: false },
  { id: "boudoir", category: "capture", label: "A filthy photo shoot", emoji: "📸", desc: "Styled, posed, explicit.", role: true, edge: false },
  { id: "film", category: "capture", label: "Film us fucking", emoji: "📹", desc: "Kept in the encrypted Vault.", role: false, edge: false },
  { id: "cumoncamera", category: "capture", label: "Cum on camera", emoji: "🎥", desc: "Film it or snap it right after.", role: true, edge: true },

  // Dirty talk
  { id: "dirtytalk", category: "words", label: "Dirty talk while you fuck me", emoji: "🗣️", desc: "In my ear, narrating everything.", role: true, edge: false },
  { id: "praise", category: "words", label: "Praise me", emoji: "🥰", desc: "Tell me how good I am.", role: true, edge: false },
  { id: "instructme", category: "words", label: "Tell me exactly what to do", emoji: "🗣️", desc: "Step by step.", role: true, edge: false },
  { id: "saywhatyouwant", category: "words", label: "Say what you want out loud", emoji: "💭", desc: "Name it in the moment.", role: false, edge: false },
  { id: "tellmewet", category: "words", label: "Tell me how wet or hard you are for me", emoji: "💬", desc: "Out loud, in detail.", role: true, edge: false },
  { id: "tellmecum", category: "words", label: "Tell me when you're about to cum", emoji: "💬", desc: "Warn me.", role: true, edge: false },
  { id: "beloud", category: "words", label: "Be loud, let me hear you", emoji: "🔊", desc: "No holding back.", role: true, edge: false },
  { id: "stayquiet", category: "words", label: "Stay quiet so we don't get caught", emoji: "🤫", desc: "Hand over the mouth.", role: false, edge: false },
  { id: "tellpictured", category: "words", label: "Tell me what you think about when you get yourself off", emoji: "💭", desc: "Your last solo fantasy.", role: true, edge: false },
  { id: "breedingtalk", category: "words", label: "\"Breed me\" and \"fill me up\" talk", emoji: "🤰", desc: "The fantasy, out loud.", role: true, edge: true },

  // Do this to me
  { id: "kissworkdown", category: "requests", label: "Kiss me, then work your way down", emoji: "💋", desc: "Lips down my body.", role: true, edge: false },
  { id: "lookupblow", category: "requests", label: "Look up at me while you suck my cock", emoji: "👀", desc: "Eyes on me the whole time.", role: true, edge: false },
  { id: "strokeandsuck", category: "requests", label: "Stroke and suck at the same time", emoji: "🤤", desc: "Mouth and hand together.", role: true, edge: false },
  { id: "playwhileblow", category: "requests", label: "Play with yourself while you suck me", emoji: "🫦", desc: "Turned on while you do it.", role: true, edge: false },
  { id: "praisemycock", category: "requests", label: "Tell me how much you love my cock or pussy while your mouth's on it", emoji: "🗣️", desc: "Worship it out loud.", role: true, edge: false },
  { id: "spitonit", category: "requests", label: "Spit on it", emoji: "💦", desc: "Messy and wet.", role: true, edge: false },
  { id: "kissinside", category: "requests", label: "Kiss me while you're inside me", emoji: "💞", desc: "Mouths together, deep.", role: true, edge: false },
  { id: "clitwhilefuck", category: "requests", label: "Rub my clit while you fuck me", emoji: "👆", desc: "Fingers and hips at once.", role: true, edge: false },
  { id: "slowdeepkiss", category: "requests", label: "Slow and deep while we make out", emoji: "🐢", desc: "Unhurried, mouths locked.", role: false, edge: false },
  { id: "biteneckgrind", category: "requests", label: "Bite my neck while you grind into me", emoji: "🦷", desc: "Teeth on my neck.", role: true, edge: false },
  { id: "handthroatfuck", category: "requests", label: "Hand on my throat while you fuck me", emoji: "🤏", desc: "Held just right.", role: true, edge: true },
  { id: "keepgoingafter", category: "requests", label: "Keep fucking me after you cum", emoji: "🔁", desc: "Don't stop.", role: true, edge: true },

  // Orgasms & cum
  { id: "finishtogether", category: "cumplay", label: "Cum at the same time", emoji: "🎆", desc: "Timed together.", role: false, edge: false },
  { id: "hercumfirst", category: "cumplay", label: "Make me cum first", emoji: "💦", desc: "My orgasm before yours.", role: true, edge: false },
  { id: "hercummore", category: "cumplay", label: "Make me cum more than once", emoji: "💦", desc: "Don't stop at one.", role: true, edge: false },
  { id: "roundtwo", category: "cumplay", label: "Round two right after", emoji: "🔁", desc: "Go again.", role: false, edge: false },
  { id: "squirting", category: "cumplay", label: "Make me squirt", emoji: "💦", desc: "Soak the sheets.", role: true, edge: true },
  { id: "overstimher", category: "cumplay", label: "Overstimulate me past the edge", emoji: "💥", desc: "Keep going after I cum.", role: true, edge: true },
  { id: "ruinedorgasm", category: "cumplay", label: "Ruin my orgasm", emoji: "🚫", desc: "Pushed over, then stopped cold.", role: true, edge: true },
  { id: "facial", category: "cumplay", label: "Facial", emoji: "💦", desc: "Cum on my face.", role: true, edge: true },
  { id: "cumonbody", category: "cumplay", label: "Cum on me wherever I want it", emoji: "💦", desc: "Tits, ass, stomach, back.", role: true, edge: true },
  { id: "cuminmouth", category: "cumplay", label: "Cum in my mouth", emoji: "👄", desc: "Swallow it, or hold it and show you.", role: true, edge: true },
  { id: "creampie", category: "cumplay", label: "Creampie", emoji: "🍯", desc: "Cum inside me.", role: true, edge: true },
  { id: "cumplay", category: "cumplay", label: "Play with the cum after", emoji: "💧", desc: "Rub it in, lick it up.", role: true, edge: true },

  // Anal
  { id: "analfingering", category: "anal", label: "A finger in my ass", emoji: "🫳", desc: "Slow, during everything else.", role: true, edge: true },
  { id: "rimming", category: "anal", label: "Rimming", emoji: "👅", desc: "Tongue on my ass.", role: true, edge: true },
  { id: "buttplug", category: "anal", label: "Butt plug or beads", emoji: "🔌", desc: "In while we fuck.", role: true, edge: true },
  { id: "analtraining", category: "anal", label: "Work up to anal slowly", emoji: "📈", desc: "Toys first, over weeks.", role: true, edge: true },
  { id: "analsex", category: "anal", label: "Anal sex", emoji: "🍑", desc: "Fuck my ass.", role: true, edge: true },
  { id: "prostate", category: "anal", label: "Prostate play", emoji: "👆", desc: "Fingers or a toy on the P-spot.", role: true, edge: true },
  { id: "pegging", category: "anal", label: "Pegging", emoji: "🍆", desc: "Strap-on.", role: true, edge: true },

  // Other people
  { id: "othersfantasytalk", category: "others", label: "Talk about fucking other people", emoji: "💭", desc: "Fantasy only, out loud.", role: false, edge: true },
  { id: "threesome-mfm", category: "others", label: "Threesome with another man", emoji: "👥", desc: "MFM.", role: false, edge: true },
  { id: "threesome-ffm", category: "others", label: "Threesome with another woman", emoji: "👥", desc: "FFM.", role: false, edge: true },
  { id: "group", category: "others", label: "Group sex", emoji: "🫂", desc: "Four or more.", role: false, edge: true },
  { id: "softswap", category: "others", label: "Soft swap", emoji: "🤝", desc: "Play with another couple, no full sex.", role: false, edge: true },
  { id: "swap", category: "others", label: "Full swap", emoji: "🔄", desc: "Swinging with another couple.", role: false, edge: true },
  { id: "watchpartner", category: "others", label: "Watch you fuck someone else", emoji: "👁️", desc: "Or be watched doing it.", role: true, edge: true },
  { id: "lifestyleclub", category: "others", label: "Go to a sex club or party", emoji: "🎉", desc: "See the scene together.", role: false, edge: true },
  { id: "postvideos", category: "others", label: "Post our videos online", emoji: "📲", desc: "Strangers watching us.", role: false, edge: true },

  // Heavier kink
  { id: "deepthroat", category: "heavier", label: "Deepthroat and throat fucking", emoji: "😮", desc: "Gagging on it.", role: true, edge: true },
  { id: "spitting", category: "heavier", label: "Spitting", emoji: "💧", desc: "In my mouth or on my face.", role: true, edge: true },
  { id: "degradation", category: "heavier", label: "Degradation and dirty names", emoji: "😈", desc: "Slut, whore, whatever gets me off.", role: true, edge: true },
  { id: "humiliation", category: "heavier", label: "Humiliation play", emoji: "🥵", desc: "Embarrassment as a turn-on.", role: true, edge: true },
  { id: "doublepen", category: "heavier", label: "Double penetration", emoji: "✌️", desc: "Two at once, toy or person.", role: true, edge: true },
  { id: "fisting", category: "heavier", label: "Fisting", emoji: "✊", desc: "Slow, lots of prep.", role: true, edge: true },
  { id: "watersports", category: "heavier", label: "Piss play", emoji: "💛", desc: "Golden showers.", role: true, edge: true },
  { id: "feminization", category: "heavier", label: "Feminization or sissy play", emoji: "💄", desc: "Dressed up and played as the other.", role: true, edge: true },
];

// Folded into another card or dropped. Never reuse these ids: stored ratings
// under them would silently attach to the new card.
export const RETIRED_QUIZ_CARD_IDS: readonly string[] = [
  "handedge", "overknee", "slapassride", "sensorydep", "tiedtobed",
  "sendnude", "dirtyvideo", "photos", "watcheachother", "filmcumming",
  "photoaftercum", "cumselfie", "dirtytalkfuck", "talkmethrough",
  "cuminmouthshow", "fantasyonly", "fantasyother", "imaginemeother",
  "forbidden", "rp-stranger", "standingbent", "bentovertable", "prone",
  "legsonshoulders", "edgeofbed", "carried", "sideentry", "reversecowgirl",
  "aftercare", "tellmehard", "tellgoodtaste",
];

export const QUIZ_CARD_BY_ID: Record<string, QuizCard> = Object.fromEntries(
  QUIZ_DECK.map((card) => [card.id, card]),
);

export function categoryTitle(id: string): string {
  return QUIZ_CATEGORIES.find((c) => c.id === id)?.title || "";
}

// Cards in the current deck this person hasn't rated yet: new cards added
// since they last played. Retired ids in their ratings are ignored.
export function unratedQuizCards(ratings: Record<string, unknown> | null | undefined): QuizCard[] {
  const rated = ratings || {};
  return QUIZ_DECK.filter((card) => !(card.id in rated));
}

// Ratings minus any retired or unknown ids, so a resubmit doesn't carry dead
// cards forward.
export function activeQuizRatings<T>(ratings: Record<string, T> | null | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, rating] of Object.entries(ratings || {})) {
    if (QUIZ_CARD_BY_ID[id]) out[id] = rating;
  }
  return out;
}

export interface QuizCategoryOverlap {
  category: string;
  title: string;
  matches: number;
  curious: number;
}

// Where your overlap clusters, busiest category first. Built only from what the
// reveal already shares (matches and curious-together), never from passes.
export function quizOverlapByCategory(
  matches: ReadonlyArray<{ cardId: string }>,
  curiousTogether: ReadonlyArray<{ cardId: string }>,
): QuizCategoryOverlap[] {
  const counts = new Map<string, { matches: number; curious: number }>();
  const bump = (cardId: string, field: "matches" | "curious") => {
    const card = QUIZ_CARD_BY_ID[cardId];
    if (!card) return;
    const entry = counts.get(card.category) || { matches: 0, curious: 0 };
    entry[field] += 1;
    counts.set(card.category, entry);
  };
  matches.forEach((m) => bump(m.cardId, "matches"));
  curiousTogether.forEach((c) => bump(c.cardId, "curious"));
  return QUIZ_CATEGORIES
    .filter((category) => counts.has(category.id))
    .map((category) => ({ category: category.id, title: category.title, ...counts.get(category.id)! }))
    .sort((a, b) => (b.matches + b.curious) - (a.matches + a.curious) || b.matches - a.matches);
}

// One-tap "propose this": deep-link to the Ask composer pre-noted with a card, so
// a quiz match / curious item turns straight into an Ask. Shared by the quiz
// reveal and the Sexboard "what you're both into" strip.
export function proposeHref(label: string): string {
  return `/ask?note=${encodeURIComponent(`From our Sex Quiz: ${label}`)}`;
}
