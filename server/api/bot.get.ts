export default defineEventHandler(async (event) => {
    const name = getQuery(event)
    return name['hub.challenge'];
});
