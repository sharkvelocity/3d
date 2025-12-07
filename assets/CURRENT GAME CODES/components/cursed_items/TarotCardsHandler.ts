
import { ICursedItemHandler } from './ICursedItemHandler';
import { AppState, AppActions } from '../../types';
import SoundManager from '../../services/SoundManager';
import { AUDIO_ROOT } from '../../constants';

declare const BABYLON: any;

type TarotCardName = 
    | "The Tower" 
    | "The Wheel of Fortune" 
    | "The Fool" 
    | "The Devil" 
    | "Death" 
    | "The Hermit" 
    | "The Sun" 
    | "The Moon" 
    | "The High Priestess" 
    | "The Hanged Man";

interface TarotCardDefinition {
    name: TarotCardName;
    chance: number; // Percentage (0-100)
    burnColor: string; // Hex or name for future visual use
    description: string;
}

const TAROT_DECK: TarotCardDefinition[] = [
    { name: "The Tower", chance: 20, burnColor: "Blue", description: "Doubles all potential ghost activity for 20 seconds." },
    { name: "The Wheel of Fortune", chance: 20, burnColor: "Green/Red", description: "+/- 25% Sanity" },
    { name: "The Fool", chance: 17, burnColor: "Light Purple", description: "Mimics another card, then reveals as The Fool. No effect." },
    { name: "The Devil", chance: 10, burnColor: "Pink", description: "Triggers a Ghost Event." },
    { name: "Death", chance: 10, burnColor: "Purple", description: "Triggers a cursed hunt." },
    { name: "The Hermit", chance: 10, burnColor: "Cyan", description: "Traps ghost in favorite room." },
    { name: "The Sun", chance: 5, burnColor: "Yellow", description: "Sanity set to 100%." },
    { name: "The Moon", chance: 5, burnColor: "White", description: "Sanity set to 0%." },
    { name: "The High Priestess", chance: 2, burnColor: "Light Yellow", description: "Revives a dead player." },
    { name: "The Hanged Man", chance: 1, burnColor: "N/A", description: "Instantly kills the player." },
];

export class TarotCardsHandler implements ICursedItemHandler {
    private scene: any;
    private actions: AppActions;
    private soundManager: SoundManager | null;
    private cardsRemaining: number = 10;
    private drawSound: any;

    constructor(scene: any, actions: AppActions, soundManager: SoundManager | null) {
        this.scene = scene;
        this.actions = actions;
        this.soundManager = soundManager;

        // Pre-load sound
        if (this.scene) {
            console.log("[TarotCardsHandler] Loading draw sound");
            this.drawSound = new BABYLON.Sound("tarot_flip", `${AUDIO_ROOT}cursed_item/tarot_card_flip.mp3`, this.scene, null, {
                loop: false,
                autoplay: false,
                volume: 1.0
            });
        }
    }

    public update(state: AppState): void {
        // Logic to update visuals if card is burning, etc.
    }

    public activate(): void {
        if (this.cardsRemaining <= 0) {
            console.log("The Tarot deck is empty.");
            return;
        }

        this.drawCard();
    }

    private drawCard(): void {
        this.cardsRemaining--;
        if (this.drawSound) {
            console.log("[TarotCardsHandler] Playing draw sound");
            this.drawSound.play();
        }

        // Need to access current state for context (hunting, friendly ghost)
        // Since we don't have direct access to `getState()` here, we rely on what might be passed in `update` 
        // or assume standard probabilities. 
        // Ideally, `activate` would receive the state, but we'll use a basic implementation for now.
        
        // NOTE: This requires the handler to be aware of the global state. 
        // In a real implementation, we would query the store. 
        // For now, we will simulate standard conditions.
        
        // Determine if Hunting (Logic placeholder: check app state if available, else assume false)
        const isHunting = false; // TODO: Get from store
        const isFriendlyGhost = false; // TODO: Get from store

        let selectedCard: TarotCardName = "The Fool";

        if (isHunting) {
            selectedCard = "The Fool";
        } else {
            const roll = Math.random() * 100;
            let cumulative = 0;
            
            for (const card of TAROT_DECK) {
                cumulative += card.chance;
                if (roll < cumulative) {
                    selectedCard = card.name;
                    break;
                }
            }
        }

        // Override Hanged Man if Friendly Ghost
        if (selectedCard === "The Hanged Man" && isFriendlyGhost) {
            selectedCard = "The Fool";
        }

        // Handle "The Fool" mimic logic
        let displayedCard = selectedCard;
        if (selectedCard === "The Fool") {
            // Pick a random card to mimic visually first
            const validMimics = TAROT_DECK.filter(c => c.name !== "The Fool");
            const mimic = validMimics[Math.floor(Math.random() * validMimics.length)];
            console.log(`You drew... ${mimic.name}? ... Wait! It's The Fool!`);
        } else {
            console.log(`You drew ${selectedCard}.`);
        }

        this.applyEffect(selectedCard);
    }

    private applyEffect(cardName: TarotCardName): void {
        switch (cardName) {
            case "The Tower":
                console.log("Ghost activity doubled for 20 seconds.");
                // Implementation would require a store modifier for activity multiplier
                break;

            case "The Wheel of Fortune":
                const isGreen = Math.random() < 0.5;
                if (isGreen) {
                    console.log("Wheel of Fortune: Green (Sanity +25%)");
                    // We need to get current sanity to modify it, or use an action that handles delta.
                    // Assuming direct update for now.
                    // this.actions.updateState({ sanity: Math.min(100, currentSanity + 25) });
                } else {
                    console.log("Wheel of Fortune: Red (Sanity -25%)");
                    // this.actions.updateState({ sanity: Math.max(0, currentSanity - 25) });
                }
                break;

            case "The Fool":
                // No effect
                break;

            case "The Devil":
                console.log("The Devil: Triggering Ghost Event.");
                this.actions.updateState({ 
                    paranormalEvent: { type: 'ghost_manifest', id: Math.random() } 
                });
                break;

            case "Death":
                console.log("Death: Cursed Hunt.");
                this.actions.startHunt(true);
                break;

            case "The Hermit":
                console.log("The Hermit: Ghost trapped in favorite room.");
                this.actions.updateState({ teleportGhostTo: 'favorite_room' });
                // Also implies trapping logic, which might need a new timer in store: `ghostTrappedTimer`
                break;

            case "The Sun":
                console.log("The Sun: Sanity restored to 100%.");
                this.actions.updateState({ sanity: 100 });
                break;

            case "The Moon":
                console.log("The Moon: Sanity dropped to 0%.");
                this.actions.updateState({ sanity: 0 });
                break;

            case "The High Priestess":
                console.log("The High Priestess: Revival token granted.");
                // Implementation: set a flag in store `hasRevivalToken: true`
                break;

            case "The Hanged Man":
                console.log("The Hanged Man: You died.");
                this.actions.gameOver("Killed by The Hanged Man");
                break;
        }
    }

    public dispose(): void {
        if (this.drawSound) {
            this.drawSound.dispose();
        }
    }
}
