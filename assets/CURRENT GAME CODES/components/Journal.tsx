import React, { useState, useMemo } from 'react';
import { EvidenceType, Ghost } from '../types';

interface JournalProps {
    ghosts: Ghost[];
    actualGhost: Ghost;
    onClose: () => void;
    onGuessMade: (message: string) => void;
}

const Journal = ({ ghosts, actualGhost, onClose, onGuessMade }: JournalProps) => {
    const [selectedEvidence, setSelectedEvidence] = useState(new Set<EvidenceType>());
    const [selectedGhostName, setSelectedGhostName] = useState<string | null>(null);
    const [resultMessage, setResultMessage] = useState("");

    const allEvidenceTypes = Object.values(EvidenceType) as EvidenceType[];

    const toggleEvidence = (evidence: EvidenceType) => {
        setSelectedEvidence(prev => {
            const newSet = new Set(prev);
            if (newSet.has(evidence)) {
                newSet.delete(evidence);
            } else {
                newSet.add(evidence);
            }
            return newSet;
        });
        setSelectedGhostName(null);
    };

    const filteredGhosts = useMemo(() => {
        if (selectedEvidence.size === 0) {
            return ghosts;
        }
        return ghosts.filter(ghost => {
            for (const evidence of selectedEvidence) {
                if (!ghost.evidence.includes(evidence)) {
                    return false;
                }
            }
            return true;
        });
    }, [ghosts, selectedEvidence]);

    const submitGuess = () => {
        if (!selectedGhostName) return;
        
        const ghostName = actualGhost.name;
        const prefix = ghostName.startsWith("The ") ? "" : "a ";

        let message = "";
        if (selectedGhostName === ghostName) {
            message = `Correct! It was ${prefix}${ghostName}. You survived... this time.`;
        } else {
            message = `Incorrect. The entity was ${prefix}${ghostName}. Better luck next time.`;
        }
        setResultMessage(message);
        onGuessMade(message);
    };

    const InvestigationTab = () => (
        <div className="flex flex-col md:flex-row flex-grow overflow-hidden">
            <div className="w-full md:w-1/4 md:pr-4 md:border-r border-b md:border-b-0 border-gray-700 mb-4 md:mb-0 pb-4 md:pb-0">
                <h2 className="text-2xl font-bold mb-4 text-red-500">Evidence</h2>
                <div className="space-y-2 grid grid-cols-2 md:grid-cols-1 gap-2">
                    {allEvidenceTypes.map(evidence => (
                        <button key={evidence} onClick={() => toggleEvidence(evidence)} className={`w-full text-left p-2 rounded transition-colors duration-200 text-sm sm:text-base ${selectedEvidence.has(evidence) ? 'bg-blue-800 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}>
                            {evidence}
                        </button>
                    ))}
                </div>
            </div>
            <div className="w-full md:w-3/4 md:pl-4 flex flex-col">
                <h2 className="text-2xl font-bold mb-4 text-red-500">{`Possible Ghosts (${filteredGhosts.length})`}</h2>
                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    <div className="space-y-4">
                        {filteredGhosts.map(ghost => (
                            <div key={ghost.name} className={`p-3 rounded-lg border-2 ${selectedGhostName === ghost.name ? 'border-green-500 bg-gray-800' : 'border-gray-700 bg-gray-800/50'}`}>
                                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                                    <div className="flex-grow">
                                        <h3 className="text-lg font-bold text-white">{ghost.name}</h3>
                                        <p className="text-xs text-gray-400">{`Evidence: ${ghost.evidence.join(', ')}`}</p>
                                        <p className="mt-2 text-sm text-gray-300">{ghost.description}</p>
                                        <p className="mt-1 text-sm"><span className="font-semibold text-green-400">Strength: </span>{ghost.strength}</p>
                                        <p className="mt-1 text-sm"><span className="font-semibold text-yellow-400">Weakness: </span>{ghost.weakness}</p>
                                    </div>
                                    <button
                                        onClick={() => setSelectedGhostName(ghost.name)}
                                        className="w-full mt-2 sm:w-auto sm:mt-0 sm:ml-4 flex-shrink-0 bg-green-600 hover:bg-green-500 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded transition-colors duration-200 text-sm"
                                        disabled={!!resultMessage}
                                    >
                                        Select
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                    {resultMessage ? (
                        <p className="text-lg font-semibold text-yellow-300 text-center sm:text-left">{resultMessage}</p>
                    ) : (
                        <p className="text-base sm:text-lg">Selected Ghost: <span className="font-bold text-green-400">{selectedGhostName || "None"}</span></p>
                    )}
                    <button
                        onClick={submitGuess}
                        disabled={!selectedGhostName || !!resultMessage}
                        className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 text-white font-bold py-2 px-6 rounded transition-colors duration-200 w-full sm:w-auto"
                    >
                        Submit Guess
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex justify-center items-center z-20" onClick={onClose}>
            <div className="w-full max-w-6xl h-[90vh] bg-gray-900 rounded-lg shadow-2xl p-4 sm:p-6 flex flex-col text-gray-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-red-600 border-b-2 border-gray-700 pb-2">Journal</h1>
                <InvestigationTab />
            </div>
        </div>
    );
};

export default Journal;
