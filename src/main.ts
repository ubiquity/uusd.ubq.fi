import { fetchTokens } from "./fetch-tokens"; 

export async function mainModule() {
  console.log(`Hello from mainModule`);

  try {
    const tokens = await fetchTokens();
    console.log('Fetched tokens:', tokens);
  } catch (error) {
    console.error('Error fetching tokens:', error);
  }
}

mainModule().catch((error) => {
  console.error('Unhandled error in mainModule:', error);
});
