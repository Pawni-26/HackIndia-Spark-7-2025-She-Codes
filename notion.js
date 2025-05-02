// Notion API integration helper functions
const NOTION_API_KEY = "secret_dLyN3xHaTsU7raNpZ6Kgx1TcTa33Kk8W3xyGtJtKnQq";
const NOTION_DATABASE_ID = "/1e6929cf91ca801abc9fe9accdc5f60e?v=1e6929cf91ca804dbf9d000c74fc7b53"; // Replace with your actual database ID

// Format page properties for Notion
function formatPageProperties(title) {
  return {
    Name: {
      title: [
        {
          text: {
            content: title
          }
        }
      ]
    },
    Tags: {
      multi_select: [
        {
          name: "Meeting"
        },
        {
          name: "Transcription"
        }
      ]
    },
    Date: {
      date: {
        start: new Date().toISOString()
      }
    }
  };
}

// Format blocks for Notion content
function formatBlocks(summary, transcript) {
  return [
    // Summary section
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: 'Summary' } }]
      }
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: summary } }]
      }
    },
    // Divider
    {
      object: 'block',
      type: 'divider',
      divider: {}
    },
    // Transcript section
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: 'Full Transcript' } }]
      }
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: transcript } }]
      }
    }
  ];
}

// Export functions for use in other files
export {
  NOTION_API_KEY,
  NOTION_DATABASE_ID,
  formatPageProperties,
  formatBlocks
};