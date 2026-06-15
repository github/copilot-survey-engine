export default {
    setup: jest.fn().mockReturnThis(),
    start: jest.fn().mockReturnThis(),
    defaultClient: {
      trackEvent: jest.fn(),
      trackDependency: jest.fn(),
      trackException: jest.fn(),
    },
};