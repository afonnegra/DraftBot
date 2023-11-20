export default defineEventHandler(async (event) => {
    const name = getRouterParam(event, 'hub.challenge')
    return name;
});
