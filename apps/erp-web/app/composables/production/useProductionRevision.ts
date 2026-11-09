export const useProductionRevision = () => {
    const revision = useState("production-execution-revision", () => 0);
    const invalidateProduction = () => { revision.value += 1; };
    return { revision, invalidateProduction };
};
