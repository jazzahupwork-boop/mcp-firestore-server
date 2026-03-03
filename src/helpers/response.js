/**
 * Build a standard MCP tool response.
 */
export function buildResponse(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Build an MCP error response.
 */
export function buildErrorResponse(error) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: error.message,
            stack: error.stack,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
