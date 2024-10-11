import { fetchTokens } from "./fetch-tokens"; // you don't need to import `TokenList` unless you're explicitly using that type elsewhere

export async function mainModule() {
  console.log(`Hello from mainModule`);

  try {
    // fetch the tokens and await the promise to resolve
    const tokens = await fetchTokens();
    console.log('Fetched tokens:', tokens); // you can now use the fetched tokens
  } catch (error) {
    console.error('Error fetching tokens:', error); // handle any errors that might occur
  }
}

// invoke the mainModule function
mainModule().catch((error) => {
  console.error('Unhandled error in mainModule:', error); // catch any unhandled errors in mainModule
});
