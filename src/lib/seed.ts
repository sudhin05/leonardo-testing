// Example data from the initial brief — replace via Library → Import CSV once the real sheet arrives.

export const SEED_PRODUCTS = [
  {
    sku: "SKU-01",
    name: "Botanica AU Hyaluronic Serum — 30ml Frosted Dropper Bottle",
    category: "Skincare & Cosmetics",
    notes: "EXAMPLE. High ACL risk. Tests glass transparency, liquid refraction, fine label text, studio lighting.",
  },
  {
    sku: "SKU-02",
    name: "Artisanal Wagyu Smash Burger & Iced Matcha Latte",
    category: "Food & Beverage / QSR",
    notes: "EXAMPLE. Organic textures, steam, condensation, appetizing grading, no plastic AI food.",
  },
  {
    sku: "SKU-03",
    name: "Performance Trail Running Shoe — Neon Coral & Charcoal",
    category: "Apparel & Footwear",
    notes: "EXAMPLE. Complex geometry, mesh texture fidelity, on-model anatomy.",
  },
  {
    sku: "SKU-04",
    name: "Matte Black Wireless Noise-Cancelling Over-Ear Headphones",
    category: "Consumer Electronics",
    notes: "EXAMPLE. Hard-surface design, metallic accents, symmetry, wearable placement.",
  },
  {
    sku: "SKU-05",
    name: "EOFY Flash Sale / WhatsApp Promotional Flyer",
    category: "Service / SaaS / Retail Event Promo",
    notes: "EXAMPLE. Pure graphic design + typography; layout, badges, CTAs.",
  },
];

export const SEED_PROMPTS = [
  {
    test_id: "P-01",
    ad_category: "Hero Product Studio Shot",
    sku: "SKU-01",
    aspect_ratio: "4:5",
    input_mode: "text",
    prompt:
      "Commercial product photography of a 30ml frosted glass dropper bottle of facial serum standing on wet travertine stone, surrounded by eucalyptus leaves and water droplets, warm golden hour sunlight casting soft diagonal shadows, 85mm macro lens, f/2.8, ultra-photorealistic, clean negative space at top for copy.",
    criteria: "Realistic glass refraction, natural shadow direction, absence of hallucinated artifacts on bottle cap.",
  },
  {
    test_id: "P-02",
    ad_category: "Typography & Sale Poster",
    sku: "SKU-05",
    aspect_ratio: "9:16",
    input_mode: "text",
    prompt:
      "A modern, high-converting vertical 9:16 social media promotional poster. Bold sans-serif headline at top reading exactly 'EOFY FLASH SALE'. Below it, a bright coral badge reading 'FLAT 40% OFF SITEWIDE'. At the bottom, a pill-shaped button reading 'SHOP ON WHATSAPP'. Background features minimalist 3D geometric podiums in navy blue (#0A192F) and gold (#FFD700).",
    criteria: "Exact spelling of all three text strings, clean font hierarchy, adherence to HEX colors, balanced layout.",
  },
  {
    test_id: "P-03",
    ad_category: "Inpainting / Background Swap",
    sku: "SKU-01",
    aspect_ratio: "4:5",
    input_mode: "reference",
    prompt:
      "Place this exact product on a sunlit wooden kitchen counter in a modern Australian coastal home, blurred ocean view through window in background, natural morning shadows matching the product base, preserve 100% of original product pixels and label.",
    criteria: "Zero alteration of the original product (ACL compliance), seamless contact shadow blending. Upload the client PNG on the prompt or product first.",
  },
  {
    test_id: "P-04",
    ad_category: "Lifestyle Human + Product",
    sku: "SKU-04",
    aspect_ratio: "4:5",
    input_mode: "text",
    prompt:
      "Candid lifestyle advertisement photo of a diverse young professional in her late 20s wearing matte black over-ear wireless headphones, sitting at an outdoor Melbourne laneway cafe holding a ceramic flat white coffee cup, natural skin texture, authentic smile, shallow depth of field, shot on 35mm film.",
    criteria: "Correct finger count on coffee cup, natural ear/headphone fit, non-plastic skin pores.",
  },
  {
    test_id: "P-05",
    ad_category: "Split-Screen Comparison Ad",
    sku: "SKU-02",
    aspect_ratio: "1:1",
    input_mode: "text",
    prompt:
      "A split-screen 1:1 Instagram ad graphic. Left side has a dull grey background with text 'ORDINARY ICED COFFEE'. Right side has a vibrant emerald green background showing a tall glass of iced matcha latte with cream swirl and text '100% ORGANIC CEREMONIAL MATCHA'. Crisp divider line down the middle.",
    criteria: "Spatial adherence (left vs. right separation), two distinct text blocks rendered accurately.",
  },
  {
    test_id: "P-06",
    ad_category: "Brand Graphic & Vector Badge",
    sku: "SKU-05",
    aspect_ratio: "1:1",
    input_mode: "text",
    prompt:
      "Flat vector graphic design of a promotional sticker pack for an Australian organic grocery brand, featuring a minimalist kangaroo icon, a badge reading '100% AUSSIE GROWN', and a ribbon reading 'FREE EXPRESS DELIVERY', clean SVG style, solid pastel green and cream palette.",
    criteria: "Clean vector edges, crisp badge geometry, accurate circular/ribbon typography.",
  },
];
