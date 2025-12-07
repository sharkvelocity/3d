
export const findPathBFS = (graph: Map<number, number[]>, startNodeId: number, endNodeId: number): number[] | null => {
    if (!graph.has(startNodeId) || !graph.has(endNodeId)) {
        return null;
    }

    if (startNodeId === endNodeId) {
        return [startNodeId];
    }

    const queue: number[][] = [[startNodeId]];
    const visited = new Set<number>([startNodeId]);

    while (queue.length > 0) {
        const path = queue.shift()!;
        const node = path[path.length - 1];

        if (node === endNodeId) {
            return path;
        }

        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                const newPath = [...path, neighbor];
                queue.push(newPath);
            }
        }
    }

    return null;
};
