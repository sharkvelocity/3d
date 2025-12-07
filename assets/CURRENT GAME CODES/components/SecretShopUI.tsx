
import React from 'react';
import { useStore } from '../store';

const SecretShopUI = () => {
    const { secretPoints, secretWave, playerUpgrades, secretPlayerHealth, secretPhaseTimer } = useStore();
    const { purchaseUpgrade, toggleSecretShop } = useStore(s => s.actions);

    const UpgradeCard = ({ title, cost, onBuy, description, current }: any) => {
        const canAfford = secretPoints >= cost;
        return (
            <div className={`p-3 border border-cyan-500/50 bg-black/80 rounded flex flex-col gap-1 w-full transition-all hover:bg-cyan-900/20 ${!canAfford ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-cyan-300 leading-tight">{title}</h3>
                    <span className={`text-sm font-mono ${canAfford ? 'text-green-400' : 'text-red-400'}`}>{cost}</span>
                </div>
                <p className="text-gray-400 text-xs">{description}</p>
                {current && <p className="text-yellow-400 text-xs">Cur: {current}</p>}
                <button 
                    onClick={onBuy} 
                    disabled={!canAfford}
                    className="mt-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-800 text-white px-2 py-1 rounded text-xs font-bold transition-colors w-full"
                >
                    BUY
                </button>
            </div>
        );
    };

    return (
        <div className="absolute top-0 bottom-0 left-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm text-white font-mono p-4 w-72 border-r-2 border-cyan-500/50 overflow-y-auto pointer-events-auto shadow-[5px_0_20px_rgba(0,0,0,0.8)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-2">
                <h1 className="text-xl text-red-500 font-bold tracking-widest">SHOP</h1>
                <button 
                    onClick={toggleSecretShop}
                    className="text-gray-400 hover:text-white text-lg font-bold"
                >
                    ✕
                </button>
            </div>

            <div className="mb-6 space-y-1">
                <p className="text-sm text-gray-400">WAVE {secretWave} CLEARED</p>
                <p className="text-xl text-green-400 font-bold">PTS: {secretPoints}</p>
                <p className="text-sm text-yellow-400 animate-pulse">NEXT WAVE: {secretPhaseTimer}s</p>
            </div>

            {secretWave === 2 && (
                <div className="mb-6 p-3 border border-red-500 bg-red-900/20 animate-pulse rounded">
                    <p className="text-xs text-red-300 uppercase mb-1">Code Unlocked</p>
                    <p className="text-xl font-bold text-white tracking-widest">REVENGE</p>
                </div>
            )}

            <div className="flex flex-col gap-4 mb-8 flex-grow">
                <UpgradeCard 
                    title="HEALTH" 
                    cost={500} 
                    description="Full Heal + Max HP +2"
                    current={`${secretPlayerHealth}/${playerUpgrades.maxHealth}`}
                    onBuy={() => purchaseUpgrade('health')}
                />
                <UpgradeCard 
                    title="FIREPOWER" 
                    cost={500} 
                    description="+20% Damage"
                    current={`x${playerUpgrades.damageMultiplier.toFixed(1)}`}
                    onBuy={() => purchaseUpgrade('firepower')}
                />
                <UpgradeCard 
                    title="GAMBLE" 
                    cost={1000} 
                    description="Random Buff/Debuff"
                    current="???"
                    onBuy={() => purchaseUpgrade('chance')}
                />
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
                <h3 className="text-sm text-yellow-400 font-bold">ACTIVE MODS</h3>
                <div className="flex flex-wrap gap-2 text-[10px] text-gray-300">
                    {playerUpgrades.hasShotgun && <span className="bg-red-900/50 px-1.5 py-0.5 rounded border border-red-500">SHOTGUN</span>}
                    {playerUpgrades.hasBouncingAmmo && <span className="bg-blue-900/50 px-1.5 py-0.5 rounded border border-blue-500">BOUNCE</span>}
                    {playerUpgrades.hasExplosiveAmmo && <span className="bg-orange-900/50 px-1.5 py-0.5 rounded border border-orange-500">BOOM</span>}
                    {playerUpgrades.hasLaser && <span className="bg-green-900/50 px-1.5 py-0.5 rounded border border-green-500">LASER</span>}
                    {playerUpgrades.fireRateMultiplier !== 1 && <span>Rate: x{playerUpgrades.fireRateMultiplier.toFixed(2)}</span>}
                    {playerUpgrades.rangeMultiplier !== 1 && <span>Range: x{playerUpgrades.rangeMultiplier.toFixed(2)}</span>}
                </div>
            </div>
        </div>
    );
};

export default SecretShopUI;
