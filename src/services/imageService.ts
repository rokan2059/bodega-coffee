import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateMenuItemImage(name: string, category: string, description?: string): Promise<string> {
  const prompt = `A high-quality, professional food photography shot of a ${name}. ${description ? description : ''}. It is a ${category} item. Studio lighting, appetizing, clean background.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Failed to generate item image:", error);
    // Return a fallback image
    return `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&q=80`;
  }
}

export async function generateCategoryImage(category: string): Promise<string> {
  const prompt = `A high-quality, professional food photography shot representing a menu category for ${category}. Studio lighting, appetizing, clean background.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } catch (error) {
    console.error("Failed to generate category image:", error);
    // Return a fallback image
    return `https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&q=80`;
  }
}
