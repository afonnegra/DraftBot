export default defineEventHandler(async (event) => {
    const name = getRouterParam(event, 'challenge')
    return name;
});
