import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function extractMenuFromImage(base64Image: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: `Extract the menu items from this image and return them as a JSON object. 
            The structure should be:
            {
              "categories": [
                {
                  "name": "Category Name",
                  "items": [
                    {
                      "name": "Item Name",
                      "price": 100, // Use a single price if only one is listed, or an object if multiple (e.g., hot/cold)
                      "prices": { "hot": 100, "cold": 120 }, // Optional: if multiple prices exist
                      "description": "Optional description"
                    }
                  ]
                }
              ]
            }
            Include all items, categories, and prices accurately. For "ADD-ONS", treat them as items within their respective sections or a separate category if appropriate.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}");
}
