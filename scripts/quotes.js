/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */


// Multiple quote APIs with fallback support
const quoteApis = {
    multilingual: {
        metadataUrl: "https://prem-k-r.github.io/multilingual-quotes-api/minified/metadata.json",
        baseQuoteUrl: "https://prem-k-r.github.io/multilingual-quotes-api/minified/"
    },
    vercel: "https://quotes-api-self.vercel.app/quote/",
    programming: "https://programming-quotesapi.vercel.app/api/random",
    dummyjson: "https://dummyjson.com/quotes"
};

const metadataUrl = quoteApis.multilingual.metadataUrl;
const baseQuoteUrl = quoteApis.multilingual.baseQuoteUrl;



const quotesContainer = document.querySelector(".quotesContainer");
const authorName = document.querySelector(".authorName span");
const authorContainer = document.querySelector(".authorName");

const MAX_QUOTE_LENGTH = 140;
const MIN_QUOTES_FOR_LANG = 100;
const ONE_DAY = 24 * 60 * 60 * 1000;

// Fallback quote for when everything fails
const FALLBACK_QUOTE = {
    quote: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson"
};

let lastKnownLanguage = null;

// Clear all quotes-related data from localStorage
function clearQuotesStorage() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.startsWith("quotes_")) {
            localStorage.removeItem(key);
        }
    });

    quotesContainer.textContent = "";
    authorName.textContent = "";
}

// Clear quotes for all languages except the specified one
function clearOtherLanguageQuotes(exceptLang) {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (
            key.startsWith("quotes_") &&
            !key.includes(`quotes_${exceptLang}`) &&
            key !== "quotes_metadata_timestamp"
        ) {
            localStorage.removeItem(key);
        }
    });
}

// Check if we need to fetch data for a language
function needsDataFetch(lang) {
    // Always fetch if offline
    if (!navigator.onLine) return false;

    // Check if language changed
    if (lastKnownLanguage !== null && lastKnownLanguage !== currentLanguage) {
        return true;
    }

    // Check if any required data is missing
    const requiredKeys = [
        `quotes_${lang}`,
        `quotes_${lang}_timestamp`,
        `quotes_${lang}_count`
    ];

    if (requiredKeys.some(key => !localStorage.getItem(key))) {
        return true;
    }

    // Check if data is stale based on quote count
    const storedCount = parseInt(localStorage.getItem(`quotes_${lang}_count`)) || 0;
    const storedTimestamp = localStorage.getItem(`quotes_${lang}_timestamp`);
    const timeDiff = Date.now() - new Date(storedTimestamp).getTime();

    // If count is 0, it means no data available for this language
    // Only refresh after 1 day to check if quotes were added
    if (storedCount === 0) {
        return timeDiff > ONE_DAY;
    }

    // Time-based validation for languages with actual quotes
    const maxAge = storedCount < MIN_QUOTES_FOR_LANG ? ONE_DAY : 7 * ONE_DAY;
    return timeDiff > maxAge;
}

// Determine target language based on availability
function getTargetLanguage(currentLang, metadata) {
    // If current language is English, use it
    if (currentLang === "en") {
        return "en";
    }

    // Check if current language has enough quotes
    const langFile = metadata?.files?.[`${currentLang}.json`];
    if (langFile && langFile.count >= MIN_QUOTES_FOR_LANG) {
        return currentLang;
    }

    // Fallback to English
    return "en";
}

// Fetch metadata from the API
async function fetchMetadata() {
    try {
        const response = await fetch(metadataUrl);
        return await response.json();
    } catch (error) {
        console.error("Error fetching metadata:", error);
        throw error;
    }
}

// Fetch quotes for a specific language
async function fetchQuotes(lang) {
    try {
        const url = `${baseQuoteUrl}${lang}.json`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching quotes for ${lang}:`, error);
        throw error;
    }
}

// Fetch a single quote from Vercel API
async function fetchVercelQuote() {
    try {
        const response = await fetch(quoteApis.vercel);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // Normalize response format
        return {
            quote: data.quote || data.text || data.content || "",
            author: data.author || data.by || "Unknown"
        };
    } catch (error) {
        console.error("Error fetching Vercel quote:", error);
        throw error;
    }
}

// Fetch a random programming quote
async function fetchProgrammingQuote() {
    try {
        const response = await fetch(quoteApis.programming);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // Normalize response format
        return {
            quote: data.quote || data.text || data.content || data.en || "",
            author: data.author || data.by || "Unknown"
        };
    } catch (error) {
        console.error("Error fetching programming quote:", error);
        throw error;
    }
}

// Fetch a quote from DummyJSON API
async function fetchDummyJsonQuote() {
    try {
        // Get random quote (1-100 range typically)
        const randomId = Math.floor(Math.random() * 100) + 1;
        const response = await fetch(`${quoteApis.dummyjson}/${randomId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // Normalize response format
        return {
            quote: data.quote || data.text || data.content || "",
            author: data.author || data.by || "Unknown"
        };
    } catch (error) {
        console.error("Error fetching DummyJSON quote:", error);
        throw error;
    }
}

// Fetch a single quote from alternative APIs (fallback chain)
async function fetchAlternativeQuote() {
    const apis = [
        { name: "vercel", fn: fetchVercelQuote },
        { name: "programming", fn: fetchProgrammingQuote },
        { name: "dummyjson", fn: fetchDummyJsonQuote }
    ];

    // Try each API in order until one succeeds
    for (const api of apis) {
        try {
            const quote = await api.fn();
            if (quote && quote.quote && quote.author) {
                return quote;
            }
        } catch (error) {
            console.error(`Failed to fetch from ${api.name} API:`, error);
            // Continue to next API
        }
    }

    throw new Error("All alternative quote APIs failed");
}

// Store quotes and metadata in localStorage
function storeQuotesData(lang, quotes, metadata) {
    const timestamp = new Date().toISOString();

    localStorage.setItem(`quotes_${lang}`, JSON.stringify(quotes));
    localStorage.setItem(`quotes_${lang}_timestamp`, timestamp);

    if (metadata) {
        localStorage.setItem("quotes_metadata_timestamp", metadata.lastUpdated);
        const quoteCount = metadata.files?.[`${lang}.json`]?.count || quotes.length;
        localStorage.setItem(`quotes_${lang}_count`, quoteCount.toString());
    }
}

// Store "no data available" information for languages without quotes
function storeNoDataInfo(lang, metadata) {
    const timestamp = new Date().toISOString();

    localStorage.setItem(`quotes_${lang}`, JSON.stringify([])); // Empty array
    localStorage.setItem(`quotes_${lang}_timestamp`, timestamp);
    localStorage.setItem(`quotes_${lang}_count`, "0"); // 0 indicates no data available

    if (metadata) {
        localStorage.setItem("quotes_metadata_timestamp", metadata.lastUpdated);
    }
}

// Get stored quotes for a language
function getStoredQuotes(lang) {
    const storedQuotes = localStorage.getItem(`quotes_${lang}`);
    return storedQuotes ? JSON.parse(storedQuotes) : null;
}

// Display fallback quote
function displayFallbackQuote() {
    quotesContainer.textContent = FALLBACK_QUOTE.quote;
    authorName.textContent = FALLBACK_QUOTE.author;
}

// Get quotes for the current language
async function getQuotesForLanguage(forceRefresh = false) {
    try {
        // Check if language has changed
        const languageChanged = lastKnownLanguage !== null && lastKnownLanguage !== currentLanguage;
        lastKnownLanguage = currentLanguage;

        // Check if we need to fetch new data
        const shouldFetch = forceRefresh || needsDataFetch(currentLanguage);

        if (shouldFetch) {
            try {
                // Try multilingual API first
                const metadata = await fetchMetadata();
                const targetLang = getTargetLanguage(currentLanguage, metadata);

                // Store info about current language availability
                const currentLangFile = metadata.files?.[`${currentLanguage}.json`];
                const currentLangCount = currentLangFile?.count || 0;

                // If current language has no quotes, store that info
                if (currentLangCount === 0 && currentLanguage !== "en") {
                    storeNoDataInfo(currentLanguage, metadata);
                }

                // Fetch quotes for target language
                const quotes = await fetchQuotes(targetLang);
                storeQuotesData(targetLang, quotes, metadata);
                clearOtherLanguageQuotes(currentLanguage || targetLang);
                return quotes;
            } catch (multilingualError) {
                console.error("Multilingual API failed, trying alternative APIs:", multilingualError);
                
                // Fallback to alternative APIs
                try {
                    const alternativeQuote = await fetchAlternativeQuote();
                    // Store as a single-item array for consistency
                    const quotes = [alternativeQuote];
                    const timestamp = new Date().toISOString();
                    localStorage.setItem(`quotes_${currentLanguage}`, JSON.stringify(quotes));
                    localStorage.setItem(`quotes_${currentLanguage}_timestamp`, timestamp);
                    localStorage.setItem(`quotes_${currentLanguage}_count`, "1");
                    return quotes;
                } catch (altError) {
                    console.error("All quote APIs failed:", altError);
                    throw altError;
                }
            }

        } else {
            // Use stored data
            const storedCount = parseInt(localStorage.getItem(`quotes_${currentLanguage}_count`)) || 0;

            // If current language has no quotes (count is 0), use English fallback
            if (storedCount === 0 && currentLanguage !== "en") {
                let englishQuotes = getStoredQuotes("en");

                // If no English quotes stored, try to fetch them
                if (!englishQuotes || englishQuotes.length === 0) {
                    try {
                        const metadata = await fetchMetadata();
                        englishQuotes = await fetchQuotes("en");
                        storeQuotesData("en", englishQuotes, metadata);
                    } catch (error) {
                        // Try alternative APIs if multilingual fails
                        try {
                            const alternativeQuote = await fetchAlternativeQuote();
                            englishQuotes = [alternativeQuote];
                            const timestamp = new Date().toISOString();
                            localStorage.setItem(`quotes_en`, JSON.stringify(englishQuotes));
                            localStorage.setItem(`quotes_en_timestamp`, timestamp);
                            localStorage.setItem(`quotes_en_count`, "1");
                        } catch (altError) {
                            console.error("Failed to fetch alternative quote:", altError);
                        }
                    }
                }

                return englishQuotes || [FALLBACK_QUOTE];
            }

            // Return stored quotes for current language
            const storedQuotes = getStoredQuotes(currentLanguage);
            if (storedQuotes && storedQuotes.length > 0) {
                return storedQuotes;
            }

            // If stored quotes are empty, try to fetch from alternative APIs
            try {
                const alternativeQuote = await fetchAlternativeQuote();
                const quotes = [alternativeQuote];
                const timestamp = new Date().toISOString();
                localStorage.setItem(`quotes_${currentLanguage}`, JSON.stringify(quotes));
                localStorage.setItem(`quotes_${currentLanguage}_timestamp`, timestamp);
                localStorage.setItem(`quotes_${currentLanguage}_count`, "1");
                return quotes;
            } catch (altError) {
                return [FALLBACK_QUOTE];
            }
        }
    } catch (error) {
        console.error("Error getting quotes:", error);

        // Try to use any stored data as fallback
        let quotes = getStoredQuotes(currentLanguage) || getStoredQuotes("en");

        if (!quotes || quotes.length === 0) {
            // Try alternative APIs one last time
            try {
                const alternativeQuote = await fetchAlternativeQuote();
                return [alternativeQuote];
            } catch (altError) {
                // Return hardcoded fallback quote if everything fails
                return [FALLBACK_QUOTE];
            }
        }

        return quotes;
    }
}

// Display a random quote that meets the length requirements
function displayRandomQuote(quotes) {
    if (!quotes || quotes.length === 0) {
        displayFallbackQuote();
        return;
    }

    let selectedQuote;
    const maxAttempts = 15; // Prevent infinite loop

    // Try to find a quote that fits within the character limit
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const randomIndex = Math.floor(Math.random() * quotes.length);
        selectedQuote = quotes[randomIndex];

        const totalLength = selectedQuote.quote.length + selectedQuote.author.length;
        if (totalLength <= MAX_QUOTE_LENGTH) {
            break;
        }
    }

    // Display the selected quote
    quotesContainer.textContent = selectedQuote.quote;
    authorName.textContent = selectedQuote.author;

    // Animate .authorName width to fit content
    requestAnimationFrame(() => {
        const fullWidth = authorName.scrollWidth;
        const padding = 16;
        authorContainer.style.width = (fullWidth + padding * 2) + "px";
    });
}

// Main function to load and display a quote
async function loadAndDisplayQuote(forceRefresh = false) {
    try {
        const quotes = await getQuotesForLanguage(forceRefresh);
        displayRandomQuote(quotes);
    } catch (error) {
        console.error("Error loading quote:", error);
        displayFallbackQuote();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const hideSearchWith = document.getElementById("shortcut_switchcheckbox");
    const quotesToggle = document.getElementById("quotesToggle");
    const motivationalQuotesCont = document.getElementById("motivationalQuotesCont");
    const motivationalQuotesCheckbox = document.getElementById("motivationalQuotesCheckbox");
    const searchWithContainer = document.getElementById("search-with-container");

    // Load states from localStorage
    hideSearchWith.checked = localStorage.getItem("showShortcutSwitch") === "true";
    motivationalQuotesCheckbox.checked = localStorage.getItem("motivationalQuotesVisible") !== "false";

    // Initialize language tracking
    lastKnownLanguage = currentLanguage;

    // Function to update quotes visibility and handle state changes
    const updateMotivationalQuotesState = () => {
        const isHideSearchWithEnabled = hideSearchWith.checked;
        const isMotivationalQuotesEnabled = motivationalQuotesCheckbox.checked;

        // Save state to localStorage
        localStorage.setItem("motivationalQuotesVisible", isMotivationalQuotesEnabled);

        // Handle visibility based on settings
        if (!isHideSearchWithEnabled) {
            quotesToggle.classList.add("inactive");
            motivationalQuotesCont.style.display = "none";
            clearQuotesStorage();
            return;
        }

        // Update UI visibility
        quotesToggle.classList.remove("inactive");
        searchWithContainer.style.display = isMotivationalQuotesEnabled ? "none" : "flex";
        motivationalQuotesCont.style.display = isMotivationalQuotesEnabled ? "flex" : "none";

        // Load quotes if motivational quotes are enabled
        if (isMotivationalQuotesEnabled) {
            loadAndDisplayQuote(false);
        } else {
            clearQuotesStorage();
        }
    };

    // Apply initial state
    updateMotivationalQuotesState();

    // Event Listeners
    hideSearchWith.addEventListener("change", () => {
        searchWithContainer.style.display = "flex";
        updateMotivationalQuotesState();
    });

    motivationalQuotesCheckbox.addEventListener("change", updateMotivationalQuotesState);
});
