
import { EvidenceType, Ghost } from '../types';

export const GHOST_MODELS = [
    'ghost_female_1.glb',
    'ghost_female_2.glb',
    'ghost_male_1.glb',
    'ghost_male_2.glb'
];

export const GHOSTS: Ghost[] = [
    {
        name: "Spirit",
        evidence: [EvidenceType.EMF5, EvidenceType.SpiritBox, EvidenceType.GhostWriting],
        strength: "Confused for a shade, has zero strengths.",
        weakness: "Using Smudge Sticks will stop it from hunting for 180 seconds if the smudge is in range of the ghost.",
        description: "A common ghost that is dredfully normal and boring, but easily pacified with smudge sticks.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Wraith",
        evidence: [EvidenceType.EMF5, EvidenceType.SpiritBox, EvidenceType.DOTS],
        strength: "Wraiths almost never touch the ground, meaning they cannot be tracked by Salt.",
        weakness: "Can travel through walls and teleport directly to players, leaving EMF traces.",
        description: "A dangerous ghost that can float through walls and teleport near players. It never touches the ground, so it cannot be tracked by salt.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Phantom",
        evidence: [EvidenceType.SpiritBox, EvidenceType.Fingerprints, EvidenceType.DOTS],
        strength: "Can wander to a random player's location, appearing to teleport. Looking at a Phantom will considerably drop your sanity, and it is much harder to see during hunts.",
        weakness: "cannot be seen in a photo, will vanish if photo taken during event.",
        description: "A ghost that instills fear and can project an image of itself, appearing to teleport. It is nearly invisible during hunts.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Poltergeist",
        evidence: [EvidenceType.SpiritBox, EvidenceType.Fingerprints, EvidenceType.GhostWriting],
        strength: "thrown objects will weaken the players sanity if hit, grows in speed the more objects to throw.",
        weakness: "Becomes less active with nothing to throw.",
        description: "A noisy ghost that loves to manipulate objects.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Banshee",
        evidence: [EvidenceType.Fingerprints, EvidenceType.GhostOrb, EvidenceType.DOTS],
        strength: "Focuses on a single player at a time, frequently roaming towards their target's location.",
        weakness: "Banshees are more likely to perform the 'singing' paranormal event.",
        description: "A natural predator that stalks its chosen victim one by one before delivering a killing blow.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Jinn",
        evidence: [EvidenceType.EMF5, EvidenceType.Fingerprints, EvidenceType.FreezingTemps],
        strength: "Travels at high speed when its victim is far away.",
        weakness: "Turning off the location's power source will prevent it from using its ability.",
        description: "A territorial ghost that moves with incredible speed.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Mare",
        evidence: [EvidenceType.SpiritBox, EvidenceType.GhostOrb, EvidenceType.GhostWriting],
        strength: "Increased chance to attack in the dark.",
        weakness: "Turning the lights on will reduce its chance to attack. and may make them move location",
        description: "A creature of nightmares, most active in dark places.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt (special: 60 in dark, 40 in light).
        huntSanityThreshold: 40,
    },
    {
        name: "Revenant",
        evidence: [EvidenceType.GhostOrb, EvidenceType.GhostWriting, EvidenceType.FreezingTemps],
        strength: "Travels at a significantly faster speed when it detects a victim.",
        weakness: "Hiding from it will cause it to move very slowly. Unless you make a noise",
        description: "A slow but relentless hunter that speeds up when it has a line of sight.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Shade",
        evidence: [EvidenceType.EMF5, EvidenceType.GhostWriting, EvidenceType.FreezingTemps],
        strength: "Hard to locate.",
        weakness: "Will not do singing ghost event, enter a hunt, or random event if you are near. More likely to appear as a mist.",
        description: "A shy ghost that is difficult to find and provoke.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 35,
    },
    {
        name: "Demon",
        evidence: [EvidenceType.Fingerprints, EvidenceType.GhostWriting, EvidenceType.FreezingTemps],
        strength: "Can hunt regardless of sanity levels.",
        weakness: "Crusafix range is increased by 50%.",
        description: "The most aggressive ghost, known for its frequent hunts.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 70,
    },
    {
        name: "Yurei",
        evidence: [EvidenceType.GhostOrb, EvidenceType.FreezingTemps, EvidenceType.DOTS],
        strength: "Has a stronger effect on people's sanity.",
        weakness: "Smudging its room will trap it temporarily, preventing wandering.",
        description: "A ghost that has a strong effect on sanity and can be trapped by smudging.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Oni",
        evidence: [EvidenceType.EMF5, EvidenceType.FreezingTemps, EvidenceType.DOTS],
        strength: "More active when people are nearby, causing more paranormal events. During a hunt, it blinks less often, making it easier to see. Cannot take a mist form.",
        weakness: "Being more active makes the Oni easier to find and identify.",
        description: "A very active and strong ghost that thrives on player presence. Its increased visibility during hunts makes it a clear threat.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Hantu",
        evidence: [EvidenceType.Fingerprints, EvidenceType.GhostOrb, EvidenceType.FreezingTemps],
        strength: "Moves faster in colder areas.",
        weakness: "Moves slower in warmer areas, near fire.",
        description: "a chilling ghost that thrives in the cold, moving faster at lower temperatures.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Yokai",
        evidence: [EvidenceType.SpiritBox, EvidenceType.GhostOrb, EvidenceType.DOTS],
        strength: "Talking near it will anger it, increasing its activity and chance to attack at higher sanity.",
        weakness: "Cannot hear voices or detect electronics during a hunt.",
        description: "A ghost attracted to human voices, becoming more active when players talk.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt (special: only when talking nearby).
        huntSanityThreshold: 80,
    },
    {
        name: "Goryo",
        evidence: [EvidenceType.EMF5, EvidenceType.Fingerprints, EvidenceType.DOTS],
        strength: "Can only be seen on camera when it passes through a D.O.T.S. Projector.",
        weakness: "Will not change its favorite room and rarely wanders far from it.",
        description: "A shy ghost whose D.O.T.S. projection is only visible through a camera.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Myling",
        evidence: [EvidenceType.EMF5, EvidenceType.Fingerprints, EvidenceType.GhostWriting],
        strength: "Known to be quieter when hunting.",
        weakness: "Makes paranormal sounds more frequently on the Parabolic Microphone.",
        description: "A quiet hunter whose footsteps are nearly silent during a hunt.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Onryo",
        evidence: [EvidenceType.SpiritBox, EvidenceType.GhostOrb, EvidenceType.FreezingTemps],
        strength: "A flame extinguishing can cause it to attack.",
        weakness: "The presence of fire calms it, preventing it from hunting.",
        description: "A ghost that fears fire, but will attack if a flame is extinguished.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 60,
    },
    {
        name: "The Twins",
        evidence: [EvidenceType.EMF5, EvidenceType.SpiritBox, EvidenceType.FreezingTemps],
        strength: "Can initiate a hunt from its current location or the location of a recent interaction. The 'decoy' twin is slightly faster.",
        weakness: "The Twins will often interact with the environment in two different places at once.",
        description: "Two entities that mimic each other's actions, making them unpredictable.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Raiju",
        evidence: [EvidenceType.EMF5, EvidenceType.GhostOrb, EvidenceType.DOTS],
        strength: "Moves faster when near active electronic equipment.",
        weakness: "Constantly disrupts electronic equipment, making it easier to track.",
        description: "A demon that feeds on electrical power, moving faster near active electronics.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt (special: only near electronics).
        huntSanityThreshold: 65,
    },
    {
        name: "Obake",
        evidence: [EvidenceType.EMF5, EvidenceType.Fingerprints, EvidenceType.GhostOrb],
        strength: "When hunting, it has a chance to briefly shapeshift into another ghost form. Sometimes leaves unique evidence.",
        weakness: "Rarely leaves traces of its passage.",
        description: "A shapeshifter that can leave unique fingerprints and has been known to change its form during a hunt.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "The Mimic",
        evidence: [EvidenceType.SpiritBox, EvidenceType.Fingerprints, EvidenceType.FreezingTemps],
        strength: "Can mimic the traits of other ghosts.",
        weakness: "Always exhibits Ghost Orbs as an additional clue, separate from its main evidence.",
        description: "An enigmatic ghost that copies the traits and abilities of other ghosts. It can be identified by the constant presence of Ghost Orbs alongside the evidence of the ghost it is currently imitating.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt (varies, this is a baseline).
        huntSanityThreshold: 50,
    },
    {
        name: "Moroi",
        evidence: [EvidenceType.SpiritBox, EvidenceType.GhostWriting, EvidenceType.FreezingTemps],
        strength: "The lower the victim's sanity, the faster the Moroi becomes.",
        weakness: "Is blinded by Smudge Sticks for twice as long.",
        description: "A ghost that becomes faster as the player's sanity drains.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 50,
    },
    {
        name: "Deogen",
        evidence: [EvidenceType.SpiritBox, EvidenceType.GhostWriting, EvidenceType.DOTS],
        strength: "Always knows where its victims are during a hunt.",
        weakness: "Moves very slowly when it gets close to its victim.",
        description: "A relentless hunter that always knows your location but slows down upon approach.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt.
        huntSanityThreshold: 40,
    },
    {
        name: "Thaye",
        evidence: [EvidenceType.GhostOrb, EvidenceType.GhostWriting, EvidenceType.DOTS],
        strength: "Becomes less active and powerful the more time you spend near it.",
        weakness: "Ages over time, making it weaker, slower and less aggressive.",
        description: "A ghost that rapidly ages when near players, starting strong and growing weaker.",
        canWander: true,
        // The sanity percentage at which this ghost can begin a hunt (decreases over time).
        huntSanityThreshold: 75,
    }
];
