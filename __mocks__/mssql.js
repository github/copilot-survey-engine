export default {
    connect: jest.fn(),
    query: jest.fn().mockResolvedValue({ recordset: [] }),
    close: jest.fn()
};