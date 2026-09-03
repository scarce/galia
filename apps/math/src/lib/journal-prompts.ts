export interface JournalEntry {
  id: number;
  userId: string;
  topicCategory: string;
  topic: string;
  content: string;
  createdAt: string;
  archived: boolean;
  deleted: boolean;
}

export interface TherapyTopic {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface JournalPrompt {
  id: string;
  emoji: string;
  title: string;
  prompt: string;
}

export const THERAPY_TOPICS: TherapyTopic[] = [
  {
    id: "emotions",
    name: "Emotions",
    icon: "💭",
    description: "Understand and express your feelings",
  },
  {
    id: "gratitude",
    name: "Gratitude",
    icon: "🙏",
    description: "Appreciate the good things in life",
  },
  {
    id: "growth",
    name: "Growth",
    icon: "🌱",
    description: "Learn and improve yourself",
  },
  {
    id: "relationships",
    name: "Relationships",
    icon: "💝",
    description: "Connect with others and show kindness",
  },
  {
    id: "resilience",
    name: "Resilience",
    icon: "💪",
    description: "Build strength through challenges",
  },
  {
    id: "mindfulness",
    name: "Mindfulness",
    icon: "🧘",
    description: "Be present and find calm",
  },
];

export const JOURNAL_PROMPTS: Record<string, JournalPrompt[]> = {
  emotions: [
    {
      id: "emotions_feelings",
      emoji: "💭",
      title: "How I'm Feeling",
      prompt: "How are you feeling right now? What's on your mind?",
    },
    {
      id: "emotions_mood",
      emoji: "🌈",
      title: "Mood Check",
      prompt: "Describe your mood in colors, shapes, or sounds.",
    },
    {
      id: "emotions_affect",
      emoji: "🎭",
      title: "What Affected My Mood",
      prompt: "What happened today that affected how you feel?",
    },
  ],
  gratitude: [
    {
      id: "gratitude_three",
      emoji: "🙏",
      title: "Three Things",
      prompt: "What are three things you're grateful for today?",
    },
    {
      id: "gratitude_person",
      emoji: "👤",
      title: "Grateful For Someone",
      prompt: "Who are you grateful for and why?",
    },
    {
      id: "gratitude_small",
      emoji: "✨",
      title: "Small Joys",
      prompt: "What small thing made you smile today?",
    },
  ],
  growth: [
    {
      id: "growth_proud",
      emoji: "⭐",
      title: "Proud Moment",
      prompt: "What's something you did today that made you proud?",
    },
    {
      id: "growth_learn",
      emoji: "🧠",
      title: "Something New",
      prompt: "What's something new you learned today?",
    },
    {
      id: "growth_goal",
      emoji: "🎯",
      title: "My Goals",
      prompt: "What are you working towards? How are you doing?",
    },
  ],
  relationships: [
    {
      id: "relationships_kindness",
      emoji: "💝",
      title: "Acts of Kindness",
      prompt: "Who did you help today, or who helped you? What happened?",
    },
    {
      id: "relationships_appreciate",
      emoji: "💌",
      title: "Appreciate Someone",
      prompt: "Write about someone who means a lot to you.",
    },
    {
      id: "relationships_connection",
      emoji: "🤝",
      title: "Connection",
      prompt: "When did you feel most connected to someone today?",
    },
  ],
  resilience: [
    {
      id: "resilience_challenge",
      emoji: "💪",
      title: "Challenge",
      prompt: "What was a challenge you faced today? How did you handle it?",
    },
    {
      id: "resilience_overcome",
      emoji: "🏔️",
      title: "Overcame",
      prompt: "What's something hard you've overcome? How did you do it?",
    },
    {
      id: "resilience_strength",
      emoji: "⚡",
      title: "Inner Strength",
      prompt: "What makes you strong? When have you shown it?",
    },
  ],
  mindfulness: [
    {
      id: "mindfulness_present",
      emoji: "🧘",
      title: "Present Moment",
      prompt: "What's something you notice right now using your five senses?",
    },
    {
      id: "mindfulness_relax",
      emoji: "🌿",
      title: "Relaxation",
      prompt: "What's your favorite way to relax? How can you do more of it?",
    },
    {
      id: "mindfulness_dream",
      emoji: "✨",
      title: "Dreams & Wishes",
      prompt: "What's something you dream about doing? Why does it matter to you?",
    },
  ],
};
