
import React, { useEffect } from 'react';
import { ICON_ROOT, LOGO_URL, LOGO2_URL } from '../constants';

interface LoadingScreenProps {
    progress: number;
    message: string;
    loadingPlayerIcon: string;
    loadingGhostIcon: string;
    isSecretMode?: boolean;
}

const LoadingScreen = ({ progress, message, loadingPlayerIcon, loadingGhostIcon, isSecretMode }: LoadingScreenProps) => {
    // Dynamic speed for player running
    const playerAnimationDuration = 0.8 - 0.5 * (progress / 100);

    // --- CONFIGURATION ---
    let leftIcon, rightIcon, leftAnimStyle, rightAnimStyle, leftClass, rightClass, logo;
    let glitchClass;
    
    // Debug logging
    useEffect(() => {
        if (isSecretMode) {
            console.log("prepairing the secret map");
        }
    }, [isSecretMode]);
    
    if (isSecretMode) {
        // SECRET MODE: Player Chases Ghost (Hardcoded Assets)
        logo = LOGO2_URL;
        leftIcon = `${ICON_ROOT}player_chasing.png`;
        rightIcon = `${ICON_ROOT}ghost_being_chased.png`;
        glitchClass = "logo-glitch-wrapper-secret";
        
        // Left (Player) Runs across screen
        leftClass = ""; 
        leftAnimStyle = { animation: `wobble-player ${playerAnimationDuration}s ease-in-out infinite` };
        
        // Right (Ghost) Floats in place
        rightClass = "animate-[wobble-ghost_2s_ease-in-out_infinite]";
        rightAnimStyle = {};
    } else {
        // NORMAL MODE: Ghost Chases Player
        logo = LOGO_URL;
        leftIcon = `${ICON_ROOT}${loadingGhostIcon}`;
        rightIcon = `${ICON_ROOT}${loadingPlayerIcon}`;
        glitchClass = "logo-glitch-wrapper";
        
        // Left (Ghost) Floats across screen
        leftClass = "animate-[wobble-ghost_2s_ease-in-out_infinite]";
        leftAnimStyle = {};
        
        // Right (Player) Runs in place
        rightClass = "";
        rightAnimStyle = { animation: `wobble-player ${playerAnimationDuration}s ease-in-out infinite` };
    }

    // Base classes for positioning
    const leftBaseClass = "absolute h-16 w-16 -translate-y-1/2 top-1/2 transition-all duration-300 ease-linear";
    const rightBaseClass = "absolute h-16 w-16 -translate-y-1/2 top-1/2 right-[-2rem]";

    return (
        <div className="absolute inset-0 bg-black z-50 flex flex-col justify-center items-center p-4 font-mono">
            <div className={`w-full max-w-xs sm:max-w-xl mb-8 ${glitchClass} h-24 sm:h-36`}>
                <img src={logo} alt="PhasmaPhoney" className="w-full h-full object-contain" />
            </div>

            <div className="w-full max-w-lg text-center">
                <div className="relative w-full h-16 mb-4">
                    {/* Left Icon (The Chaser) */}
                    <img
                        src={leftIcon}
                        alt="Chaser"
                        className={`${leftBaseClass} ${leftClass}`}
                        style={{ ...leftAnimStyle, left: `calc(${progress}% - 32px)` }}
                    />
                    
                    {/* Right Icon (The Chased) */}
                    <img
                        src={rightIcon}
                        alt="Chased"
                        className={`${rightBaseClass} ${rightClass}`}
                        style={rightAnimStyle}
                    />
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div
                        className="bg-red-600 h-2.5 rounded-full transition-all duration-300 ease-linear"
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>
                <p className="text-red-500 text-xl mt-4">{`${Math.round(progress)}%`}</p>
                <p className="text-white text-lg mt-1 animate-[text-flicker_3s_infinite]">{message}</p>
            </div>
        </div>
    );
};

export default LoadingScreen;
