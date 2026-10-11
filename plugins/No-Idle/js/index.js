export default plugin({
    start({ cleanup }) {
        cleanup(
            revenge.discord.flux.onFluxEventDispatched("IDLE", (action) => {
                action.idle = false;
                return action;
            })
        );
    }
});
