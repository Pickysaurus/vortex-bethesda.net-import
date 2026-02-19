const gameId = process.env.NEXUS_GAME_ID;
const modId = process.env.NEXUS_MOD_ID;
const apiKey = process.env.NEXUS_API_KEY;

if (!gameId || !modId || !apiKey) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const query = `
  query($modId: ID!, $gameId: ID!) {
    modFiles(modId: $modId, gameId: $gameId) {
      fileId
      date
      primary
      name
    }
  }
`;

async function run() {
  const response = await fetch("https://api.nexusmods.com/v2/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": apiKey,
    },
    body: JSON.stringify({
      query,
      variables: {
        modId,
        gameId,
      },
    }),
  });

  const json = await response.json();

  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const files = json.data?.modFiles ?? [];

  if (!files.length) {
    console.error("No files returned.");
    process.exit(1);
  }

  // Sort newest by date
  const primary = files.find(f => f.primary);
  const latest = primary ?? files.sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  )[files.length - 1];

  if (!latest?.fileId) {
    console.error("Could not determine latest fileId.");
    process.exit(1);
  }

  // GitHub Actions output
  console.log(`latest_file_id=${latest.fileId}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
