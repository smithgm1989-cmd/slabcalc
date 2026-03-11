import Anthropic from '@anthropic-ai/sdk'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

const SYSTEM_PROMPT = `You are an expert Pokemon TCG card grader with deep knowledge of PSA, BGS (Beckett), CGC, and ACE grading standards and current market prices.

When given card images, respond ONLY with a valid JSON object (no markdown, no backticks, no extra text) in this exact structure:
{
  "cardName": "Full card name e.g. Charizard VMAX",
  "setName": "Set name e.g. Evolving Skies (2021)",
  "cardNumber": "Card number if visible e.g. 203/203",
  "rarity": "Rarity e.g. Alt Art, Holo Rare, Full Art",
  "centering": "9.5",
  "corners": "9",
  "edges": "9",
  "surface": "8.5",
  "aiNotes": "2-3 sentence plain-English assessment: what looks good, what visible flaws might cost points, overall impression.",
  "graders": [
    {
      "name": "PSA",
      "fee": "$25",
      "estimatedGrade": "9",
      "confidence": "High",
      "gradingNotes": "One sentence on how PSA specifically would view this card.",
      "prices": [
        { "grade": "PSA 10", "price": "$480", "highlighted": false },
        { "grade": "PSA 9",  "price": "$210", "highlighted": true },
        { "grade": "PSA 8",  "price": "$120", "highlighted": false }
      ],
      "roiLabel": "+38% vs raw",
      "roiPercent": 38,
      "roiPositive": true
    },
    {
      "name": "BGS",
      "fee": "$22",
      "estimatedGrade": "9",
      "confidence": "Medium",
      "gradingNotes": "One sentence on BGS subgrades for this card.",
      "prices": [
        { "grade": "BGS 10",  "price": "$600", "highlighted": false },
        { "grade": "BGS 9.5", "price": "$280", "highlighted": false },
        { "grade": "BGS 9",   "price": "$180", "highlighted": true }
      ],
      "roiLabel": "+18% vs raw",
      "roiPercent": 18,
      "roiPositive": true
    },
    {
      "name": "CGC",
      "fee": "$18",
      "estimatedGrade": "9",
      "confidence": "High",
      "gradingNotes": "One sentence on CGC standards for this card.",
      "prices": [
        { "grade": "CGC 10",  "price": "$320", "highlighted": false },
        { "grade": "CGC 9.5", "price": "$180", "highlighted": false },
        { "grade": "CGC 9",   "price": "$155", "highlighted": true }
      ],
      "roiLabel": "+2% vs raw",
      "roiPercent": 2,
      "roiPositive": true
    },
    {
      "name": "ACE",
      "fee": "$15",
      "estimatedGrade": "9",
      "confidence": "Medium",
      "gradingNotes": "One sentence noting ACE as a newer, budget-friendly option.",
      "prices": [
        { "grade": "ACE 10", "price": "$200", "highlighted": false },
        { "grade": "ACE 9",  "price": "$140", "highlighted": true },
        { "grade": "ACE 8",  "price": "$90",  "highlighted": false }
      ],
      "roiLabel": "-8% vs raw",
      "roiPercent": 8,
      "roiPositive": false
    }
  ],
  "bestGrader": "PSA",
  "bestGraderReason": "2 sentence explanation of why this grader offers the best ROI for this specific card, mentioning expected net profit after fees."
}

Use realistic current eBay sold-listing market prices. If you cannot identify the card clearly, provide your best estimate and note uncertainty in aiNotes.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { frontImage, backImage } = req.body

  if (!frontImage) {
    return res.status(400).json({ error: 'Front image is required' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in .env.local' })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Build message content with images
  const content = []

  content.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: frontImage.mediaType,
      data: frontImage.data,
    },
  })

  if (backImage) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: backImage.mediaType,
        data: backImage.data,
      },
    })
  }

  content.push({
    type: 'text',
    text: frontImage && backImage
      ? 'The first image is the card front, the second is the card back. Analyze both sides carefully for condition issues and provide your grading assessment.'
      : 'Please analyze this card image and provide your grading assessment.',
  })

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    })

    const raw = response.content.map(b => b.text || '').join('')
    const clean = raw.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(clean)
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON. Try again.', raw })
    }

    return res.status(200).json(parsed)
  } catch (err) {
    console.error('Anthropic error:', err)
    return res.status(500).json({ error: err.message || 'Unknown error from Anthropic API' })
  }
}
