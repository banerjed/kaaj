# AI Assistant Module Specification

**Version:** 1.0
**Last Updated:** December 3, 2025
**Status:** Draft
**Parent Document:** [Product Specification](./product-specification.md)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Vision](#product-vision)
3. [Core Capabilities](#core-capabilities)
4. [Architecture Overview](#architecture-overview)
5. [User Experience](#user-experience)
6. [Technical Implementation](#technical-implementation)
7. [Action Execution Framework](#action-execution-framework)
8. [Knowledge Management](#knowledge-management)
9. [Security & Privacy](#security--privacy)
10. [Integration with Modules](#integration-with-modules)
11. [Performance & Scalability](#performance--scalability)
12. [Success Metrics](#success-metrics)
13. [Implementation Roadmap](#implementation-roadmap)

---

## Executive Summary

The AI Assistant is an always-available, intelligent chatbot powered by Claude AI that helps users navigate the platform, answer questions, and execute actions with minimal effort. The assistant serves as a natural language interface to all platform functionality, reducing friction and accelerating task completion.

### Key Features
- **Conversational Interface**: Natural language interaction for all platform features
- **Contextual Help**: Instant answers about how to use the platform based on product guides
- **Action Execution**: Direct execution of tasks through conversational commands
- **Smart Suggestions**: Proactive recommendations based on user context and history
- **Multi-Modal Support**: Text input with future support for voice and file attachments
- **Persistent Conversations**: Conversation history and context preservation
- **Multi-Lingual**: Support for all platform locales

### Use Cases
1. **Onboarding**: Guide new users through platform setup and first tasks
2. **Task Automation**: Execute common tasks via natural language ("Submit my timesheet", "Request 3 days PTO")
3. **Information Retrieval**: Quick access to data ("Show my pay stubs", "Who is my manager?")
4. **Troubleshooting**: Help resolve issues and answer "how-to" questions
5. **Workflow Acceleration**: Complete multi-step processes with single commands

---

## Product Vision

### Problem Statement

Users face several challenges when using business management software:
- **Steep Learning Curve**: Complex UIs require extensive training
- **Feature Discovery**: Users don't know what the system can do
- **Navigation Friction**: Multiple clicks to reach desired functionality
- **Context Switching**: Interrupting work to learn how to perform tasks
- **Support Delays**: Waiting for help desk responses for simple questions

### Solution

An AI-powered assistant that:
- **Understands Intent**: Interprets natural language to determine what users want to accomplish
- **Executes Actions**: Directly performs tasks on behalf of users with proper authorization
- **Provides Guidance**: Offers contextual help and step-by-step instructions
- **Learns Patterns**: Adapts to common user workflows and preferences
- **Reduces Friction**: Minimizes clicks and cognitive load

### Success Criteria

- **Adoption**: 80%+ of active users interact with the assistant monthly
- **Resolution Rate**: 70%+ of queries resolved without human support
- **Task Completion**: 60%+ of action requests successfully executed
- **User Satisfaction**: 4.5+ star rating for assistant interactions
- **Time Savings**: 30%+ reduction in time to complete common tasks

---

## Core Capabilities

### 1. Knowledge-Based Q&A

**Functionality**:
- Answer questions about platform features and functionality
- Explain business concepts (PTO policies, pay periods, etc.)
- Provide step-by-step instructions for complex workflows
- Reference and quote from product documentation

**Examples**:
- *"How do I submit a time off request?"*
- *"What is our company's holiday policy?"*
- *"Where can I find my pay stubs?"*
- *"How do I change my direct deposit information?"*

**Knowledge Sources**:
- Product documentation and user guides
- Tenant-specific policies and settings
- FAQ database
- Help articles and tutorials

### 2. Action Execution

**Functionality**:
- Execute platform actions through natural language commands
- Handle multi-step workflows with single commands
- Request confirmations for sensitive operations
- Provide real-time feedback on action progress

**Examples**:
- *"Request 3 days of PTO starting next Monday"*
- *"Submit my timesheet for this week"*
- *"Update my phone number to 555-1234"*
- *"Show me all open tickets assigned to me"*
- *"Create a new ticket for IT support about printer issues"*
- *"Approve Jane's time off request"*

**Action Categories**:
- **Data Retrieval**: View records, generate reports, search data
- **Data Creation**: Create new records (time off, expenses, tickets)
- **Data Modification**: Update existing records
- **Workflow Actions**: Submit, approve, reject requests
- **Navigation**: Open specific pages or modules

### 3. Contextual Assistance

**Functionality**:
- Understand user's current context (page, role, recent activity)
- Provide relevant suggestions based on context
- Remember conversation history for follow-up questions
- Detect user frustration and offer proactive help

**Examples**:
- User on time off page → *"Would you like me to help you request time off?"*
- User viewing report with errors → *"I noticed some validation errors. Would you like help fixing them?"*
- Follow-up question → *"What about next month?"* (context: previous query about schedules)

### 4. Smart Recommendations

**Functionality**:
- Suggest next actions based on user patterns
- Remind users of pending tasks and deadlines
- Recommend process improvements
- Surface relevant information proactively

**Examples**:
- *"You have 3 pending approvals. Would you like to review them?"*
- *"Your timesheet is due tomorrow. Should I open it for you?"*
- *"I noticed you frequently request PTO on Fridays. Would you like to set up a recurring schedule?"*

### 5. Multi-Turn Conversations

**Functionality**:
- Maintain conversation context across multiple messages
- Handle clarifying questions and refinements
- Support complex, multi-step interactions
- Enable conversation branching and topic switching

**Examples**:
```
User: "I need time off"
Assistant: "I can help you request time off. When would you like to take time off?"
User: "Next week Monday through Wednesday"
Assistant: "That's December 9-11, 2025. Which type of time off? (PTO, Sick Leave, Unpaid)"
User: "PTO"
Assistant: "You have 15 days of PTO available. Would you like me to submit this request?"
User: "Yes"
Assistant: "✓ Your PTO request has been submitted and sent to John Smith for approval."
```

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Chat Widget (Always Available)                               │  │
│  │  • Floating button (bottom-right)                             │  │
│  │  • Expandable chat panel                                      │  │
│  │  • Keyboard shortcut (Cmd/Ctrl + K)                           │  │
│  │  • Full-screen mode option                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    AI ASSISTANT SERVICE                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Message    │  │   Context    │  │  Response    │             │
│  │  Processing  │→ │   Builder    │→ │  Generator   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│         ↓                  ↓                  ↓                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Intent     │  │  Knowledge   │  │    Action    │             │
│  │  Detection   │  │   Retrieval  │  │   Executor   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      CLAUDE API                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Anthropic Claude API (claude-3.5-sonnet)                     │  │
│  │  • Natural language understanding                             │  │
│  │  • Intent classification                                      │  │
│  │  • Response generation                                        │  │
│  │  • Tool/function calling                                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │      HR      │  │   Payroll    │  │  Ticketing   │             │
│  │   Module     │  │   Module     │  │   Module     │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Accounting  │  │  Recruiting  │  │   Expense    │             │
│  │   Module     │  │   Module     │  │   Module     │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Conversation │  │   Knowledge  │  │     User     │             │
│  │   History    │  │     Base     │  │  Preferences │             │
│  │  (Postgres)  │  │(Elasticsearch│  │   (Redis)    │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 1. Chat Widget (Frontend)
- Floating, always-accessible UI component
- Message input and conversation display
- Real-time updates and typing indicators
- Attachment handling (future)
- Voice input (future)

#### 2. Message Processing Service
- Receive and validate user messages
- Extract conversation context
- Route messages to appropriate handlers
- Manage rate limiting and queuing

#### 3. Context Builder
- Gather relevant context for AI model:
  - User profile and permissions
  - Current page/module context
  - Conversation history
  - Tenant settings and policies
  - Recent user activity
- Build system prompt with context

#### 4. Intent Detection
- Classify user intent (question, action request, navigation)
- Extract entities (dates, names, IDs, amounts)
- Determine required actions/tools
- Assess confidence level

#### 5. Knowledge Retrieval
- Search product documentation
- Retrieve relevant help articles
- Access tenant-specific policies
- Query FAQ database
- Use RAG (Retrieval Augmented Generation)

#### 6. Action Executor
- Execute platform actions via internal APIs
- Validate permissions before execution
- Handle multi-step workflows
- Provide progress updates
- Rollback on errors

#### 7. Response Generator
- Generate natural language responses
- Format data for display
- Include relevant action buttons
- Provide follow-up suggestions
- Support multi-lingual responses

---

## User Experience

### Chat Interface Design

#### Floating Chat Widget

**Collapsed State**:
- Circular button with chat icon (bottom-right corner)
- Unread message count badge
- Subtle pulse animation for proactive suggestions
- Position: 24px from bottom, 24px from right

**Expanded State**:
- Panel: 400px wide × 600px tall (desktop)
- Header: Assistant name, status indicator, minimize/maximize buttons
- Message area: Scrollable conversation history
- Input area: Text field with send button, attachments button
- Footer: Suggested actions (chips/buttons)

**Full-Screen Mode**:
- Activated via maximize button or keyboard shortcut
- Center-aligned, 800px max width
- Better for complex conversations
- Side panel showing context (current page, user info)

#### Message Types

**User Messages**:
```
┌─────────────────────────────────────────┐
│ [User Avatar] User Name              □ │  [Header]
│ ─────────────────────────────────────── │
│                                         │
│                     How do I request ┃  │  [User message]
│                              time off? ┃ │  (right-aligned)
│                                         │
│  ● ● ●                                  │  [Typing indicator]
│                                         │
└─────────────────────────────────────────┘
```

**Assistant Messages**:
```
┌─────────────────────────────────────────┐
│ [AI Avatar] ┃ I can help you request    │  [Assistant message]
│            ┃ time off. Here's how:      │  (left-aligned)
│            ┃                             │
│            ┃ 1. Go to Time Off page      │
│            ┃ 2. Click "Request Time Off" │
│            ┃ 3. Select dates and type    │
│            ┃                             │
│            ┃ Or I can do this for you!   │
│            ┃ Just tell me:               │
│            ┃ • Which dates?              │
│            ┃ • Type (PTO/Sick/Other)?    │
│                                         │
│  [ Request Time Off ]  [ Learn More ]   │  [Action buttons]
│                                         │
└─────────────────────────────────────────┘
```

**Action Confirmation**:
```
┌─────────────────────────────────────────┐
│ [AI Avatar] ┃ I'm about to submit:      │
│            ┃                             │
│            ┃ ╭────────────────────────╮ │
│            ┃ │ PTO Request            │ │  [Confirmation card]
│            ┃ │ Dates: Dec 9-11, 2025  │ │
│            ┃ │ Days: 3 days           │ │
│            ┃ │ Remaining: 12 days     │ │
│            ┃ ╰────────────────────────╯ │
│            ┃                             │
│            ┃ Confirm this request?       │
│                                         │
│  [ ✓ Yes, Submit ]    [ ✗ Cancel ]      │  [Confirmation buttons]
│                                         │
└─────────────────────────────────────────┘
```

**Action Success**:
```
┌─────────────────────────────────────────┐
│ [AI Avatar] ┃ ✓ Done! Your PTO request  │
│            ┃ has been submitted.        │
│            ┃                             │
│            ┃ Next steps:                 │
│            ┃ • John Smith will review    │
│            ┃ • You'll be notified        │
│            ┃                             │
│  [ View Request ]  [ Request More PTO ] │
│                                         │
└─────────────────────────────────────────┘
```

#### Suggested Actions

**Context-Aware Chips**:
- Display 3-5 suggested actions based on context
- Update dynamically as conversation progresses
- Examples:
  - On dashboard: `"Show my tasks"`, `"Submit timesheet"`, `"Check PTO balance"`
  - After viewing employee: `"Edit employee"`, `"View reports"`, `"See history"`
  - In conversation: `"Yes"`, `"No"`, `"Tell me more"`, `"Start over"`

#### Keyboard Shortcuts

- **Cmd/Ctrl + K**: Open/close chat widget
- **Cmd/Ctrl + Shift + K**: Open full-screen mode
- **Esc**: Close chat widget
- **Arrow Up**: Edit last message
- **Cmd/Ctrl + Enter**: Send message

#### Accessibility

- **Screen Reader Support**: Full ARIA labels and descriptions
- **Keyboard Navigation**: All features accessible via keyboard
- **High Contrast Mode**: Sufficient color contrast for readability
- **Focus Indicators**: Clear focus states for all interactive elements
- **Text Alternatives**: Alt text for all icons and images

---

## Technical Implementation

### Database Schema

#### Conversations Table

```sql
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),

    -- Conversation metadata
    title TEXT, -- Auto-generated from first message
    status VARCHAR(50) DEFAULT 'active', -- active, archived, deleted

    -- Context
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    message_count INT DEFAULT 0,

    -- Categorization
    primary_intent VARCHAR(100), -- help_request, action_request, navigation, etc.
    topics TEXT[], -- Array of topics discussed
    modules_referenced TEXT[], -- Modules involved in conversation

    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_type VARCHAR(50), -- answered, action_completed, escalated, abandoned

    -- Feedback
    user_rating INT CHECK (user_rating BETWEEN 1 AND 5),
    user_feedback TEXT,

    -- Metadata
    metadata JSONB, -- Flexible storage for additional data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_conversations_tenant_user ON ai_conversations(tenant_id, user_id);
CREATE INDEX idx_ai_conversations_status ON ai_conversations(status, last_message_at DESC);
CREATE INDEX idx_ai_conversations_topics ON ai_conversations USING GIN(topics);
```

#### Messages Table

```sql
CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id),

    -- Message content
    role VARCHAR(20) NOT NULL, -- user, assistant, system
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text', -- text, markdown, html

    -- Attachments (future)
    attachments JSONB, -- [{type: 'file', url: '...', name: '...'}]

    -- Intent and entities
    detected_intent VARCHAR(100),
    confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
    entities JSONB, -- Extracted entities: {date: '2025-12-09', type: 'PTO', days: 3}

    -- Actions performed
    actions_executed JSONB, -- [{action: 'create_time_off', params: {...}, result: {...}}]

    -- AI model info
    model_used VARCHAR(100), -- claude-3.5-sonnet-20241022
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    response_time_ms INT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Search optimization
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', content)
    ) STORED
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
CREATE INDEX idx_ai_messages_tenant ON ai_messages(tenant_id);
CREATE INDEX idx_ai_messages_search ON ai_messages USING GIN(search_vector);
CREATE INDEX idx_ai_messages_intent ON ai_messages(detected_intent) WHERE role = 'user';
```

#### Knowledge Base Table

```sql
CREATE TABLE ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id), -- NULL for global knowledge

    -- Content
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'markdown', -- markdown, html, plain

    -- Categorization
    category VARCHAR(100), -- user_guide, faq, policy, feature_doc, etc.
    module VARCHAR(50), -- hr, payroll, accounting, etc.
    tags TEXT[],

    -- Search and retrieval
    keywords TEXT[],
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(keywords, ' '), '')), 'C')
    ) STORED,

    -- Embeddings (for semantic search)
    embedding vector(1536), -- OpenAI/Claude embedding dimension

    -- Access control
    required_permissions TEXT[], -- Permissions needed to view this content
    is_public BOOLEAN DEFAULT TRUE,

    -- Versioning
    version INT DEFAULT 1,
    previous_version_id UUID REFERENCES ai_knowledge_base(id),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    published_at TIMESTAMP WITH TIME ZONE,

    -- Usage tracking
    view_count INT DEFAULT 0,
    helpful_count INT DEFAULT 0,
    not_helpful_count INT DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_ai_knowledge_tenant ON ai_knowledge_base(tenant_id);
CREATE INDEX idx_ai_knowledge_search ON ai_knowledge_base USING GIN(search_vector);
CREATE INDEX idx_ai_knowledge_category ON ai_knowledge_base(category, module);
CREATE INDEX idx_ai_knowledge_tags ON ai_knowledge_base USING GIN(tags);

-- For vector similarity search (requires pgvector extension)
CREATE INDEX idx_ai_knowledge_embedding ON ai_knowledge_base
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

#### User Preferences Table

```sql
CREATE TABLE ai_user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id UUID NOT NULL REFERENCES users(id),

    -- Preferences
    enabled BOOLEAN DEFAULT TRUE,

    -- Interaction style
    verbosity VARCHAR(20) DEFAULT 'balanced', -- concise, balanced, detailed
    show_suggestions BOOLEAN DEFAULT TRUE,
    proactive_help BOOLEAN DEFAULT TRUE,

    -- Notifications
    notify_on_completion BOOLEAN DEFAULT TRUE,

    -- UI preferences
    default_view VARCHAR(20) DEFAULT 'panel', -- panel, fullscreen
    theme VARCHAR(20) DEFAULT 'auto', -- light, dark, auto

    -- Privacy
    store_conversation_history BOOLEAN DEFAULT TRUE,
    share_data_for_improvement BOOLEAN DEFAULT TRUE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_ai_preferences_user ON ai_user_preferences(user_id);
```

### API Endpoints

#### Chat API

```typescript
// POST /api/ai/chat
// Send a message to the AI assistant
interface ChatRequest {
  conversation_id?: string; // Optional: create new if not provided
  message: string;
  context?: {
    current_page?: string;
    current_module?: string;
    current_record_id?: string;
    custom_context?: Record<string, any>;
  };
}

interface ChatResponse {
  conversation_id: string;
  message_id: string;
  response: {
    content: string;
    content_type: 'text' | 'markdown' | 'html';
    actions?: ActionButton[]; // Suggested action buttons
    follow_up_suggestions?: string[]; // Follow-up question suggestions
  };
  executed_actions?: ExecutedAction[]; // Actions performed
  metadata: {
    detected_intent: string;
    confidence: number;
    processing_time_ms: number;
  };
}

interface ActionButton {
  id: string;
  label: string;
  action: string; // Action identifier
  params?: Record<string, any>;
  style: 'primary' | 'secondary' | 'danger';
}

interface ExecutedAction {
  action: string;
  params: Record<string, any>;
  result: {
    success: boolean;
    message?: string;
    data?: any;
    error?: string;
  };
}
```

```typescript
// GET /api/ai/conversations
// List user's conversations
interface ListConversationsRequest {
  limit?: number; // Default: 20
  offset?: number; // Default: 0
  status?: 'active' | 'archived' | 'deleted';
  sort?: 'last_message_at' | 'created_at';
  order?: 'asc' | 'desc';
}

interface ListConversationsResponse {
  conversations: ConversationSummary[];
  total: number;
  has_more: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  last_message: string; // Preview of last message
  last_message_at: string;
  message_count: number;
  unread_count: number;
  status: string;
}
```

```typescript
// GET /api/ai/conversations/:id
// Get conversation details and history
interface GetConversationResponse {
  id: string;
  title: string;
  status: string;
  messages: Message[];
  metadata: {
    started_at: string;
    last_message_at: string;
    message_count: number;
    resolved: boolean;
    user_rating?: number;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  actions_executed?: ExecutedAction[];
  created_at: string;
}
```

```typescript
// POST /api/ai/conversations/:id/feedback
// Provide feedback on conversation
interface FeedbackRequest {
  rating: number; // 1-5
  feedback?: string; // Optional text feedback
}
```

```typescript
// POST /api/ai/knowledge/search
// Search knowledge base
interface KnowledgeSearchRequest {
  query: string;
  category?: string;
  module?: string;
  limit?: number; // Default: 10
  search_type?: 'keyword' | 'semantic'; // Default: 'keyword'
}

interface KnowledgeSearchResponse {
  results: KnowledgeArticle[];
  total: number;
}

interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  module?: string;
  relevance_score: number; // 0.0 to 1.0
  url?: string; // Link to full article
}
```

#### Action Execution API

```typescript
// POST /api/ai/actions/execute
// Execute an action on behalf of user
interface ActionExecutionRequest {
  action: string; // Action identifier
  params: Record<string, any>; // Action parameters
  conversation_id?: string; // Optional: link to conversation
  require_confirmation?: boolean; // Default: true for sensitive actions
}

interface ActionExecutionResponse {
  success: boolean;
  action: string;
  result: {
    message: string;
    data?: any;
    next_steps?: string[];
  };
  confirmation_required?: {
    message: string;
    confirmation_token: string;
    expires_at: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
```

```typescript
// POST /api/ai/actions/confirm
// Confirm a pending action
interface ActionConfirmationRequest {
  confirmation_token: string;
}
```

### Claude API Integration

#### System Prompt Structure

```typescript
const buildSystemPrompt = (context: ConversationContext): string => {
  const { user, tenant, currentPage, permissions } = context;

  return `You are an intelligent assistant for ${tenant.company_name}'s business management platform. Your role is to help ${user.first_name} ${user.last_name} (${user.roles.join(', ')}) accomplish tasks efficiently.

## Current Context
- User: ${user.first_name} ${user.last_name} (${user.email})
- Role: ${user.roles.join(', ')}
- Current Page: ${currentPage || 'Dashboard'}
- Locale: ${user.locale}
- Timezone: ${user.timezone}

## Your Capabilities
1. **Answer Questions**: Provide information about platform features, company policies, and how to use the system
2. **Execute Actions**: Perform tasks on behalf of the user using available tools/functions
3. **Guide Users**: Provide step-by-step instructions for complex workflows
4. **Retrieve Information**: Search and display data from the platform

## Available Tools
${formatAvailableTools(permissions)}

## Guidelines
1. Be concise and actionable - users want to get work done quickly
2. Always confirm before executing sensitive actions (deletions, approvals, financial transactions)
3. If you're unsure about the user's intent, ask clarifying questions
4. Respect user permissions - only offer actions they're authorized to perform
5. Provide context and explain why certain actions require approval or can't be performed
6. Use the user's preferred locale (${user.locale}) and formats
7. When referencing dates, use the user's timezone (${user.timezone})

## Knowledge Base
You have access to:
- Product documentation and user guides
- Company policies and settings for ${tenant.company_name}
- FAQ and troubleshooting guides
- Module-specific help content

## Conversation Style
- **Tone**: Professional but friendly
- **Verbosity**: ${user.preferences?.verbosity || 'balanced'}
- **Language**: ${user.locale}

When the user requests an action:
1. Validate you have the required information
2. Check user has necessary permissions
3. Confirm sensitive actions before executing
4. Execute the action using appropriate tools
5. Provide clear feedback on success/failure
6. Suggest relevant next steps

Remember: Your goal is to reduce friction and help users accomplish their tasks with minimal effort.`;
};
```

#### Tool/Function Definitions

```typescript
const tools: ClaudeTool[] = [
  {
    name: "search_knowledge_base",
    description: "Search the product documentation and help articles to answer user questions about how to use the platform",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query"
        },
        category: {
          type: "string",
          enum: ["user_guide", "faq", "policy", "feature_doc"],
          description: "Optional: filter by category"
        },
        module: {
          type: "string",
          enum: ["hr", "payroll", "accounting", "ticketing", "recruiting"],
          description: "Optional: filter by module"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "create_time_off_request",
    description: "Create a new time off request for the user",
    input_schema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          format: "date",
          description: "Start date (YYYY-MM-DD)"
        },
        end_date: {
          type: "string",
          format: "date",
          description: "End date (YYYY-MM-DD)"
        },
        time_off_type: {
          type: "string",
          enum: ["pto", "sick", "unpaid", "bereavement", "jury_duty"],
          description: "Type of time off"
        },
        notes: {
          type: "string",
          description: "Optional notes/reason"
        }
      },
      required: ["start_date", "end_date", "time_off_type"]
    }
  },
  {
    name: "get_time_off_balance",
    description: "Get the user's current time off balance",
    input_schema: {
      type: "object",
      properties: {
        employee_id: {
          type: "string",
          description: "Employee ID (defaults to current user)"
        }
      }
    }
  },
  {
    name: "get_employee_info",
    description: "Retrieve employee information",
    input_schema: {
      type: "object",
      properties: {
        employee_id: {
          type: "string",
          description: "Employee ID or 'me' for current user"
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Specific fields to retrieve (optional)"
        }
      },
      required: ["employee_id"]
    }
  },
  {
    name: "update_employee_info",
    description: "Update employee information (limited to fields user has permission to edit)",
    input_schema: {
      type: "object",
      properties: {
        employee_id: {
          type: "string",
          description: "Employee ID"
        },
        updates: {
          type: "object",
          description: "Fields to update"
        }
      },
      required: ["employee_id", "updates"]
    }
  },
  {
    name: "create_ticket",
    description: "Create a new support ticket",
    input_schema: {
      type: "object",
      properties: {
        business_area: {
          type: "string",
          enum: ["it", "hr", "facilities", "finance", "other"],
          description: "Business area for the ticket"
        },
        title: {
          type: "string",
          description: "Ticket title/summary"
        },
        description: {
          type: "string",
          description: "Detailed description"
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Severity level"
        }
      },
      required: ["business_area", "title", "description"]
    }
  },
  {
    name: "get_pending_approvals",
    description: "Get list of items pending the user's approval",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["time_off", "expense", "ticket", "all"],
          description: "Type of approvals to retrieve"
        },
        limit: {
          type: "integer",
          description: "Maximum number of results"
        }
      }
    }
  },
  {
    name: "approve_time_off_request",
    description: "Approve a time off request",
    input_schema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "Time off request ID"
        },
        notes: {
          type: "string",
          description: "Optional approval notes"
        }
      },
      required: ["request_id"]
    }
  },
  {
    name: "navigate_to_page",
    description: "Navigate user to a specific page or module",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description: "Page identifier or URL path"
        },
        params: {
          type: "object",
          description: "Optional URL parameters"
        }
      },
      required: ["page"]
    }
  },
  {
    name: "generate_report",
    description: "Generate a report with specified parameters",
    input_schema: {
      type: "object",
      properties: {
        report_type: {
          type: "string",
          description: "Type of report to generate"
        },
        parameters: {
          type: "object",
          description: "Report parameters (date range, filters, etc.)"
        },
        format: {
          type: "string",
          enum: ["pdf", "excel", "csv"],
          description: "Output format"
        }
      },
      required: ["report_type"]
    }
  }
];
```

#### Message Processing Flow

```typescript
// services/ai/message-processor.ts
export class AIMessageProcessor {

  async processMessage(
    userId: string,
    conversationId: string | null,
    message: string,
    context: ConversationContext
  ): Promise<ChatResponse> {

    // 1. Get or create conversation
    const conversation = await this.getOrCreateConversation(
      userId,
      conversationId
    );

    // 2. Store user message
    const userMessage = await this.storeMessage(conversation.id, {
      role: 'user',
      content: message
    });

    // 3. Build context for Claude
    const systemPrompt = buildSystemPrompt(context);
    const conversationHistory = await this.getConversationHistory(
      conversation.id,
      10 // Last 10 messages
    );

    // 4. Call Claude API
    const claudeResponse = await this.callClaudeAPI({
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: message }
      ],
      tools: this.getAvailableTools(context.user.permissions),
      max_tokens: 4096
    });

    // 5. Process tool calls (if any)
    const executedActions = await this.executeTools(
      claudeResponse.tool_calls,
      context
    );

    // 6. Get final response (may require second Claude call if tools were used)
    let finalResponse = claudeResponse.content;
    if (executedActions.length > 0) {
      finalResponse = await this.getFinalResponse(
        systemPrompt,
        conversationHistory,
        message,
        executedActions
      );
    }

    // 7. Extract suggestions and action buttons
    const suggestions = this.extractSuggestions(finalResponse, context);
    const actionButtons = this.generateActionButtons(
      claudeResponse.tool_calls,
      context
    );

    // 8. Store assistant message
    const assistantMessage = await this.storeMessage(conversation.id, {
      role: 'assistant',
      content: finalResponse,
      detected_intent: claudeResponse.intent,
      confidence_score: claudeResponse.confidence,
      actions_executed: executedActions,
      model_used: claudeResponse.model,
      prompt_tokens: claudeResponse.usage.input_tokens,
      completion_tokens: claudeResponse.usage.output_tokens,
      total_tokens: claudeResponse.usage.total_tokens,
      response_time_ms: claudeResponse.processing_time
    });

    // 9. Update conversation metadata
    await this.updateConversation(conversation.id, {
      last_message_at: new Date(),
      message_count: conversation.message_count + 2,
      primary_intent: claudeResponse.intent,
      topics: this.extractTopics(message, finalResponse)
    });

    // 10. Return response
    return {
      conversation_id: conversation.id,
      message_id: assistantMessage.id,
      response: {
        content: finalResponse,
        content_type: 'markdown',
        actions: actionButtons,
        follow_up_suggestions: suggestions
      },
      executed_actions: executedActions,
      metadata: {
        detected_intent: claudeResponse.intent,
        confidence: claudeResponse.confidence,
        processing_time_ms: claudeResponse.processing_time
      }
    };
  }

  private async executeTools(
    toolCalls: ClaudeToolCall[],
    context: ConversationContext
  ): Promise<ExecutedAction[]> {
    const results: ExecutedAction[] = [];

    for (const toolCall of toolCalls) {
      try {
        // Validate permissions
        if (!this.hasPermission(context.user, toolCall.name)) {
          results.push({
            action: toolCall.name,
            params: toolCall.input,
            result: {
              success: false,
              error: 'PERMISSION_DENIED',
              message: 'You do not have permission to perform this action'
            }
          });
          continue;
        }

        // Check if confirmation required
        if (this.requiresConfirmation(toolCall.name)) {
          const token = await this.createConfirmationToken(toolCall);
          results.push({
            action: toolCall.name,
            params: toolCall.input,
            result: {
              success: false,
              message: 'Confirmation required',
              data: { confirmation_token: token }
            }
          });
          continue;
        }

        // Execute action
        const actionResult = await this.actionExecutor.execute(
          toolCall.name,
          toolCall.input,
          context
        );

        results.push({
          action: toolCall.name,
          params: toolCall.input,
          result: {
            success: true,
            message: actionResult.message,
            data: actionResult.data
          }
        });

      } catch (error) {
        results.push({
          action: toolCall.name,
          params: toolCall.input,
          result: {
            success: false,
            error: error.code || 'EXECUTION_ERROR',
            message: error.message
          }
        });
      }
    }

    return results;
  }
}
```

---

## Action Execution Framework

### Action Registry

```typescript
// services/ai/action-registry.ts

interface ActionDefinition {
  name: string;
  description: string;
  module: string; // Which module owns this action
  permissions: string[]; // Required permissions
  requiresConfirmation: boolean;
  sensitiveData: boolean; // Contains PII or sensitive info
  handler: (params: any, context: ActionContext) => Promise<ActionResult>;
  validator?: (params: any) => ValidationResult;
}

export class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  get(actionName: string): ActionDefinition | undefined {
    return this.actions.get(actionName);
  }

  getAvailableActions(userPermissions: string[]): ActionDefinition[] {
    return Array.from(this.actions.values()).filter(action =>
      this.hasRequiredPermissions(action.permissions, userPermissions)
    );
  }

  private hasRequiredPermissions(
    required: string[],
    userPerms: string[]
  ): boolean {
    return required.every(perm =>
      userPerms.includes(perm) || userPerms.includes('*')
    );
  }
}

// Initialize registry with all available actions
export const actionRegistry = new ActionRegistry();

// Register HR module actions
actionRegistry.register({
  name: 'create_time_off_request',
  description: 'Create a new time off request',
  module: 'hr',
  permissions: ['hr:timeoff:create:self'],
  requiresConfirmation: false,
  sensitiveData: false,
  handler: async (params, context) => {
    const { start_date, end_date, time_off_type, notes } = params;
    const { user, tenant } = context;

    // Validate dates
    if (new Date(start_date) > new Date(end_date)) {
      throw new ValidationError('Start date must be before end date');
    }

    // Check balance
    const balance = await timeOffService.getBalance(
      user.employee_id,
      time_off_type
    );

    const requestedDays = calculateBusinessDays(start_date, end_date);

    if (balance < requestedDays) {
      throw new BusinessError(
        `Insufficient balance. You have ${balance} days available but requested ${requestedDays} days.`
      );
    }

    // Create request
    const request = await timeOffService.createRequest({
      employee_id: user.employee_id,
      start_date,
      end_date,
      time_off_type,
      notes,
      status: 'pending'
    });

    return {
      success: true,
      message: `Time off request created successfully. Sent to ${request.approver_name} for approval.`,
      data: {
        request_id: request.id,
        days_requested: requestedDays,
        remaining_balance: balance - requestedDays,
        approver: request.approver_name
      }
    };
  }
});

actionRegistry.register({
  name: 'get_time_off_balance',
  description: 'Get time off balance',
  module: 'hr',
  permissions: ['hr:timeoff:read:self'],
  requiresConfirmation: false,
  sensitiveData: false,
  handler: async (params, context) => {
    const employeeId = params.employee_id || context.user.employee_id;

    // Check if user can view this employee's balance
    if (employeeId !== context.user.employee_id) {
      if (!context.user.permissions.includes('hr:timeoff:read:all')) {
        throw new PermissionError('Cannot view other employees\' balances');
      }
    }

    const balances = await timeOffService.getBalances(employeeId);

    return {
      success: true,
      message: 'Time off balances retrieved',
      data: { balances }
    };
  }
});

actionRegistry.register({
  name: 'approve_time_off_request',
  description: 'Approve a time off request',
  module: 'hr',
  permissions: ['hr:timeoff:approve'],
  requiresConfirmation: true, // Requires confirmation
  sensitiveData: false,
  handler: async (params, context) => {
    const { request_id, notes } = params;

    // Get request
    const request = await timeOffService.getRequest(request_id);

    // Verify user is the approver
    if (request.approver_id !== context.user.employee_id) {
      throw new PermissionError('You are not authorized to approve this request');
    }

    // Approve
    await timeOffService.approveRequest(request_id, {
      approved_by: context.user.id,
      approved_at: new Date(),
      notes
    });

    return {
      success: true,
      message: `Time off request approved for ${request.employee_name}`,
      data: {
        request_id,
        employee_name: request.employee_name,
        dates: `${request.start_date} to ${request.end_date}`
      }
    };
  }
});

// Ticketing module actions
actionRegistry.register({
  name: 'create_ticket',
  description: 'Create a new support ticket',
  module: 'ticketing',
  permissions: ['ticketing:tickets:create'],
  requiresConfirmation: false,
  sensitiveData: false,
  handler: async (params, context) => {
    const { business_area, title, description, severity } = params;

    const ticket = await ticketingService.createTicket({
      tenant_id: context.tenant.id,
      created_by: context.user.id,
      requester_id: context.user.id,
      business_area,
      title,
      description,
      severity: severity || 'medium',
      status: 'pending'
    });

    return {
      success: true,
      message: `Ticket #${ticket.ticket_number} created successfully`,
      data: {
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status
      }
    };
  }
});

// Employee profile actions
actionRegistry.register({
  name: 'update_employee_info',
  description: 'Update employee information',
  module: 'hr',
  permissions: ['hr:employees:update:self'], // Or :all for admins
  requiresConfirmation: false,
  sensitiveData: true, // May contain PII
  handler: async (params, context) => {
    const { employee_id, updates } = params;

    // Check permissions
    if (employee_id !== context.user.employee_id) {
      if (!context.user.permissions.includes('hr:employees:update:all')) {
        throw new PermissionError('Cannot update other employees');
      }
    }

    // Validate allowed fields based on permissions
    const allowedFields = getAllowedFields(
      context.user.permissions,
      employee_id === context.user.employee_id
    );

    const invalidFields = Object.keys(updates).filter(
      field => !allowedFields.includes(field)
    );

    if (invalidFields.length > 0) {
      throw new ValidationError(
        `Cannot update fields: ${invalidFields.join(', ')}`
      );
    }

    // Update employee
    await employeeService.update(employee_id, updates);

    return {
      success: true,
      message: 'Employee information updated successfully',
      data: { updated_fields: Object.keys(updates) }
    };
  }
});
```

### Action Executor

```typescript
// services/ai/action-executor.ts

export class ActionExecutor {
  constructor(
    private registry: ActionRegistry,
    private auditLogger: AuditLogger
  ) {}

  async execute(
    actionName: string,
    params: any,
    context: ActionContext
  ): Promise<ActionResult> {

    // Get action definition
    const action = this.registry.get(actionName);
    if (!action) {
      throw new Error(`Unknown action: ${actionName}`);
    }

    // Validate permissions
    if (!this.hasPermissions(action.permissions, context.user.permissions)) {
      await this.auditLogger.log({
        tenant_id: context.tenant.id,
        user_id: context.user.id,
        action: actionName,
        status: 'denied',
        error: 'PERMISSION_DENIED'
      });

      throw new PermissionError(
        `Missing required permissions: ${action.permissions.join(', ')}`
      );
    }

    // Validate parameters
    if (action.validator) {
      const validation = action.validator(params);
      if (!validation.valid) {
        throw new ValidationError(validation.errors.join(', '));
      }
    }

    // Execute action
    const startTime = Date.now();
    try {
      const result = await action.handler(params, context);
      const duration = Date.now() - startTime;

      // Audit log
      await this.auditLogger.log({
        tenant_id: context.tenant.id,
        user_id: context.user.id,
        action: actionName,
        resource_type: action.module,
        old_values: null,
        new_values: this.sanitizeForAudit(params, action.sensitiveData),
        status: 'success',
        metadata: {
          duration_ms: duration,
          result_summary: result.message
        }
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Audit log failure
      await this.auditLogger.log({
        tenant_id: context.tenant.id,
        user_id: context.user.id,
        action: actionName,
        resource_type: action.module,
        status: 'failure',
        error_message: error.message,
        metadata: {
          duration_ms: duration,
          error_type: error.constructor.name
        }
      });

      throw error;
    }
  }

  private sanitizeForAudit(data: any, sensitiveData: boolean): any {
    if (!sensitiveData) return data;

    // Redact sensitive fields
    const redactedFields = [
      'password', 'ssn', 'tax_id', 'bank_account',
      'routing_number', 'credit_card'
    ];

    const sanitized = { ...data };
    for (const field of redactedFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
```

---

## Knowledge Management

### Knowledge Base Structure

**Content Categories**:
1. **User Guides**: Step-by-step instructions for features
2. **FAQs**: Common questions and answers
3. **Policies**: Company/tenant-specific policies
4. **Feature Documentation**: Detailed feature descriptions
5. **Troubleshooting**: Error resolution guides
6. **Release Notes**: New features and changes

### Knowledge Ingestion Pipeline

```typescript
// services/ai/knowledge-ingestion.ts

export class KnowledgeIngestionService {

  /**
   * Ingest markdown documentation files into knowledge base
   */
  async ingestDocumentation(
    filePath: string,
    metadata: {
      category: string;
      module?: string;
      tags?: string[];
    }
  ): Promise<void> {

    // Read markdown file
    const content = await fs.readFile(filePath, 'utf-8');

    // Parse frontmatter and content
    const { data: frontmatter, content: body } = matter(content);

    // Split into sections (by ## headings)
    const sections = this.splitIntoSections(body);

    // Generate embeddings
    const embeddings = await this.generateEmbeddings(
      sections.map(s => s.content)
    );

    // Store each section as separate knowledge base entry
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const embedding = embeddings[i];

      await db.ai_knowledge_base.create({
        title: section.heading,
        content: section.content,
        content_type: 'markdown',
        category: metadata.category,
        module: metadata.module,
        tags: metadata.tags,
        keywords: this.extractKeywords(section.content),
        embedding: embedding,
        is_public: true,
        is_active: true,
        published_at: new Date()
      });
    }
  }

  /**
   * Generate embeddings using Claude or OpenAI
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Use Claude's or OpenAI's embedding API
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: texts,
    });

    return response.data.map(d => d.embedding);
  }

  /**
   * Split markdown content into logical sections
   */
  private splitIntoSections(markdown: string): Section[] {
    const lines = markdown.split('\n');
    const sections: Section[] = [];
    let currentSection: Section | null = null;

    for (const line of lines) {
      // Check for heading (## Level 2)
      const headingMatch = line.match(/^##\s+(.+)$/);

      if (headingMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: headingMatch[1],
          content: ''
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Extract keywords using simple NLP
   */
  private extractKeywords(text: string): string[] {
    // Remove markdown syntax
    const cleaned = text
      .replace(/[#*`_\[\]()]/g, '')
      .toLowerCase();

    // Split into words
    const words = cleaned.split(/\s+/);

    // Remove stop words and short words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had'
    ]);

    const keywords = words.filter(word =>
      word.length > 3 && !stopWords.has(word)
    );

    // Count frequency and return top 10
    const frequency = new Map<string, number>();
    for (const word of keywords) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
}
```

### Knowledge Retrieval (RAG)

```typescript
// services/ai/knowledge-retrieval.ts

export class KnowledgeRetrievalService {

  /**
   * Hybrid search: keyword + semantic similarity
   */
  async search(
    query: string,
    options: {
      category?: string;
      module?: string;
      tenantId?: string; // For tenant-specific knowledge
      limit?: number;
    } = {}
  ): Promise<KnowledgeArticle[]> {

    const { category, module, tenantId, limit = 5 } = options;

    // 1. Keyword search (PostgreSQL full-text search)
    const keywordResults = await this.keywordSearch(query, {
      category,
      module,
      tenantId,
      limit: limit * 2 // Get more results for re-ranking
    });

    // 2. Semantic search (vector similarity)
    const queryEmbedding = await this.generateEmbedding(query);
    const semanticResults = await this.semanticSearch(queryEmbedding, {
      category,
      module,
      tenantId,
      limit: limit * 2
    });

    // 3. Merge and re-rank results
    const merged = this.mergeResults(keywordResults, semanticResults);
    const ranked = await this.rerank(query, merged);

    return ranked.slice(0, limit);
  }

  private async keywordSearch(
    query: string,
    options: any
  ): Promise<KnowledgeArticle[]> {

    let sql = `
      SELECT
        id, title, content, category, module,
        ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
      FROM ai_knowledge_base
      WHERE is_active = TRUE
        AND search_vector @@ plainto_tsquery('english', $1)
    `;

    const params: any[] = [query];
    let paramIndex = 2;

    if (options.category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(options.category);
    }

    if (options.module) {
      sql += ` AND module = $${paramIndex++}`;
      params.push(options.module);
    }

    if (options.tenantId) {
      sql += ` AND (tenant_id = $${paramIndex++} OR tenant_id IS NULL)`;
      params.push(options.tenantId);
    } else {
      sql += ` AND tenant_id IS NULL`; // Only global knowledge
    }

    sql += ` ORDER BY rank DESC LIMIT $${paramIndex}`;
    params.push(options.limit);

    const results = await db.query(sql, params);
    return results.rows;
  }

  private async semanticSearch(
    queryEmbedding: number[],
    options: any
  ): Promise<KnowledgeArticle[]> {

    let sql = `
      SELECT
        id, title, content, category, module,
        1 - (embedding <=> $1::vector) as similarity
      FROM ai_knowledge_base
      WHERE is_active = TRUE
    `;

    const params: any[] = [JSON.stringify(queryEmbedding)];
    let paramIndex = 2;

    if (options.category) {
      sql += ` AND category = $${paramIndex++}`;
      params.push(options.category);
    }

    if (options.module) {
      sql += ` AND module = $${paramIndex++}`;
      params.push(options.module);
    }

    if (options.tenantId) {
      sql += ` AND (tenant_id = $${paramIndex++} OR tenant_id IS NULL)`;
      params.push(options.tenantId);
    } else {
      sql += ` AND tenant_id IS NULL`;
    }

    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
    params.push(options.limit);

    const results = await db.query(sql, params);
    return results.rows;
  }

  private mergeResults(
    keywordResults: KnowledgeArticle[],
    semanticResults: KnowledgeArticle[]
  ): KnowledgeArticle[] {

    const seen = new Set<string>();
    const merged: KnowledgeArticle[] = [];

    // Add keyword results with higher weight
    for (const result of keywordResults) {
      if (!seen.has(result.id)) {
        result.relevance_score = result.rank * 0.6 + (result.similarity || 0) * 0.4;
        merged.push(result);
        seen.add(result.id);
      }
    }

    // Add semantic results not already included
    for (const result of semanticResults) {
      if (!seen.has(result.id)) {
        result.relevance_score = (result.rank || 0) * 0.4 + result.similarity * 0.6;
        merged.push(result);
        seen.add(result.id);
      }
    }

    return merged;
  }

  /**
   * Re-rank results using Claude for relevance
   */
  private async rerank(
    query: string,
    results: KnowledgeArticle[]
  ): Promise<KnowledgeArticle[]> {

    // For now, just sort by relevance score
    // Future: use Claude to re-rank based on semantic understanding
    return results.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  /**
   * Format knowledge articles for inclusion in Claude prompt
   */
  formatForPrompt(articles: KnowledgeArticle[]): string {
    if (articles.length === 0) {
      return 'No relevant documentation found.';
    }

    let formatted = '## Relevant Documentation\n\n';

    for (const article of articles) {
      formatted += `### ${article.title}\n\n`;
      formatted += `${article.content}\n\n`;
      formatted += `---\n\n`;
    }

    return formatted;
  }
}
```

---

## Security & Privacy

### Data Protection

**Conversation Data**:
- All conversations encrypted at rest (database-level encryption)
- PII in messages protected with field-level encryption
- Conversations scoped to tenant (multi-tenant isolation)
- Users can only access their own conversations

**Sensitive Information Handling**:
- SSN, bank account numbers, passwords never stored in conversations
- Automatic redaction of sensitive patterns in stored messages
- Sensitive data in action executions logged as `[REDACTED]`

**Data Retention**:
- Conversations retained for 90 days by default
- Users can delete individual conversations or all history
- Tenant admins can configure retention policy
- Compliance with GDPR right to be forgotten

### Permission Enforcement

**Action-Level Permissions**:
```typescript
// Every action checks user permissions before execution
async execute(action: string, params: any, context: ActionContext) {
  const actionDef = registry.get(action);

  // Check required permissions
  if (!hasPermissions(context.user.permissions, actionDef.permissions)) {
    throw new PermissionError('Insufficient permissions');
  }

  // Check data-level permissions (e.g., can only view own data)
  if (actionDef.dataLevelCheck) {
    if (!actionDef.dataLevelCheck(params, context)) {
      throw new PermissionError('Cannot access requested data');
    }
  }

  // Execute
  return actionDef.handler(params, context);
}
```

**Confirmation for Sensitive Actions**:
- Approvals (time off, expenses)
- Deletions
- Financial transactions
- Permission changes
- Bulk operations

```typescript
// Confirmation flow
if (actionDef.requiresConfirmation) {
  // 1. Create confirmation token
  const token = await createConfirmationToken({
    action: action,
    params: params,
    userId: context.user.id,
    expiresAt: addMinutes(new Date(), 5) // 5 minute expiry
  });

  // 2. Return to user requesting confirmation
  return {
    success: false,
    confirmation_required: {
      token: token,
      message: `Please confirm: ${actionDef.confirmationMessage}`,
      expires_at: addMinutes(new Date(), 5)
    }
  };
}
```

### Audit Logging

**All AI Interactions Logged**:
```typescript
interface AIAuditLog {
  tenant_id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;

  // User input
  user_message: string;
  detected_intent: string;

  // AI response
  assistant_response: string;

  // Actions executed
  actions_executed: {
    action: string;
    params: any; // Sanitized
    result: 'success' | 'failure';
    error?: string;
  }[];

  // Metadata
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}
```

### Rate Limiting

**Per-User Rate Limits**:
- 60 messages per minute
- 1000 messages per day
- 10 action executions per minute
- 100 action executions per hour

**Per-Tenant Rate Limits**:
- 1000 messages per minute (across all users)
- 100,000 messages per day
- 500 concurrent conversations

**Claude API Rate Limits**:
- Respect Anthropic's rate limits
- Queue requests during high load
- Implement exponential backoff for retries

### Privacy Controls

**User Settings**:
```typescript
interface AIPrivacySettings {
  // Conversation history
  store_conversation_history: boolean; // Default: true
  conversation_retention_days: number; // Default: 90

  // Data sharing
  share_data_for_improvement: boolean; // Default: true (anonymized)
  allow_conversation_review: boolean; // Allow admins to review for quality

  // Notifications
  notify_on_action_completion: boolean; // Default: true
}
```

**Admin Controls**:
- Tenant admins can disable AI assistant for specific users/roles
- View aggregated usage metrics (not individual conversations without consent)
- Configure which actions are allowed
- Set organizational policies

---

## Integration with Modules

### Module-Specific Capabilities

Each module exposes actions and knowledge to the AI assistant:

**HR Module**:
- Actions: Request PTO, view pay stubs, update profile, view team
- Knowledge: PTO policies, benefits enrollment, performance reviews

**Payroll Module**:
- Actions: View paychecks, download tax forms, update direct deposit
- Knowledge: Pay schedule, tax withholdings, deductions

**Ticketing Module**:
- Actions: Create ticket, view my tickets, update ticket status
- Knowledge: How to submit tickets, SLA information

**Accounting Module** (Future):
- Actions: View invoices, create expense report, approve expenses
- Knowledge: Expense policies, approval workflows

**Recruiting Module** (Future):
- Actions: View job postings, refer candidate, check application status
- Knowledge: Hiring process, referral bonuses

### Module Integration Pattern

```typescript
// modules/hr/ai-integration.ts

export const hrAIIntegration: ModuleAIIntegration = {
  module: 'hr',

  // Register actions
  actions: [
    {
      name: 'create_time_off_request',
      handler: timeOffActions.createRequest,
      permissions: ['hr:timeoff:create:self'],
      // ... other metadata
    },
    // ... more actions
  ],

  // Provide knowledge base content
  async getKnowledgeContent(): Promise<KnowledgeContent[]> {
    return [
      {
        title: 'How to Request Time Off',
        content: '...',
        category: 'user_guide',
        module: 'hr',
        tags: ['time-off', 'pto', 'vacation']
      },
      // ... more knowledge articles
    ];
  },

  // Context provider: add module-specific context to AI prompts
  async getContext(user: User, page?: string): Promise<ModuleContext> {
    if (page?.startsWith('/hr/timeoff')) {
      const balance = await timeOffService.getBalance(user.employee_id);
      const pendingRequests = await timeOffService.getPendingRequests(user.employee_id);

      return {
        current_context: 'time_off_management',
        data: {
          pto_balance: balance,
          pending_requests: pendingRequests.length,
          next_holiday: await getNextHoliday(user.tenant_id)
        },
        suggestions: [
          'Request time off',
          'Check my PTO balance',
          'View my time off requests'
        ]
      };
    }

    return {};
  }
};

// Register with AI assistant
aiAssistant.registerModule(hrAIIntegration);
```

---

## Performance & Scalability

### Caching Strategy

**1. Response Caching**:
- Cache common questions and answers
- Cache key: hash(user_message + context)
- TTL: 1 hour for general questions, 5 minutes for data queries
- Invalidate on relevant data changes

**2. Knowledge Base Caching**:
- Cache frequently accessed articles in Redis
- Pre-compute embeddings for all content
- Cache search results for popular queries

**3. Context Caching**:
- Cache user context (permissions, preferences) for session duration
- Cache tenant settings
- Cache module context for current page

### Load Management

**Queue System for Actions**:
```typescript
// Use Bull queue for async action execution
const actionQueue = new Queue('ai-actions', {
  redis: redisConfig
});

actionQueue.process('execute-action', async (job) => {
  const { action, params, context } = job.data;

  try {
    const result = await actionExecutor.execute(action, params, context);
    return result;
  } catch (error) {
    // Retry logic
    if (job.attemptsMade < 3) {
      throw error; // Will retry
    }
    // Max retries exceeded
    return { success: false, error: error.message };
  }
});
```

**Claude API Optimization**:
- Batch requests when possible
- Use Claude's prompt caching for system prompts
- Implement request queuing during rate limit
- Monitor token usage and optimize prompts

### Monitoring

**Key Metrics**:
- **Usage**: Messages per day/hour, active conversations, unique users
- **Performance**: Response time (p50, p95, p99), Claude API latency
- **Quality**: Resolution rate, user ratings, escalation rate
- **Actions**: Success rate, failure rate, confirmation rate
- **Cost**: Claude API token usage, cost per interaction

**Alerts**:
- Response time > 5 seconds (p95)
- Error rate > 5%
- Claude API rate limit approaching
- Cost per day exceeds threshold

---

## Success Metrics

### Product Metrics

**Adoption**:
- % of active users who have used assistant
- Messages per active user per month
- Conversations started per day
- % of users with 5+ interactions

**Engagement**:
- Average messages per conversation
- Conversation completion rate
- Return user rate (used in multiple sessions)
- Feature discovery via assistant

**Resolution**:
- % of questions answered without escalation
- % of actions successfully completed
- Average time to resolution
- % of conversations marked as resolved

**Satisfaction**:
- Average user rating (1-5 stars)
- % of 4-5 star ratings
- User feedback sentiment analysis
- Net Promoter Score (NPS) for assistant

### Business Metrics

**Efficiency**:
- Time saved per user per month
- Reduction in support tickets
- Faster task completion time
- Reduced training time for new users

**Cost**:
- Claude API cost per user per month
- Cost per conversation
- Cost per action executed
- ROI (time saved × user hourly cost - API cost)

**Growth**:
- Feature adoption driven by assistant
- User retention impact
- Expansion to additional modules

---

## Implementation Roadmap

### Phase 1: MVP (Weeks 1-6)

**Week 1-2: Foundation**
- [ ] Database schema implementation
- [ ] API endpoints for chat
- [ ] Basic frontend chat widget
- [ ] Claude API integration
- [ ] Authentication & authorization

**Week 3-4: Core Functionality**
- [ ] Knowledge base ingestion pipeline
- [ ] RAG implementation (keyword + semantic search)
- [ ] Basic action execution framework
- [ ] Register 5-10 essential actions (HR module)
- [ ] Context building system

**Week 5-6: Polish & Testing**
- [ ] Conversation history and persistence
- [ ] User preferences
- [ ] Error handling and retries
- [ ] Security review
- [ ] Performance testing
- [ ] Beta testing with internal users

**MVP Features**:
- ✅ Chat widget (collapsed/expanded states)
- ✅ Natural language Q&A about platform
- ✅ 5-10 actions (time off, employee info, tickets)
- ✅ Conversation history
- ✅ Basic knowledge base

### Phase 2: Enhancement (Weeks 7-12)

**Week 7-8: Advanced Features**
- [ ] Action confirmations
- [ ] Multi-step workflows
- [ ] Contextual suggestions
- [ ] Proactive notifications
- [ ] Full-screen mode

**Week 9-10: Expanded Coverage**
- [ ] Register actions for all Phase 1 modules
- [ ] Comprehensive knowledge base (all documentation)
- [ ] Tenant-specific knowledge (policies)
- [ ] Module-specific context providers

**Week 11-12: Optimization**
- [ ] Response caching
- [ ] Prompt optimization
- [ ] Token usage reduction
- [ ] Performance improvements
- [ ] Analytics dashboard

### Phase 3: Advanced Capabilities (Weeks 13-20)

**Week 13-15: Intelligence**
- [ ] User pattern learning
- [ ] Smart recommendations
- [ ] Workflow predictions
- [ ] Personalized suggestions

**Week 16-17: Multi-Modal**
- [ ] Voice input
- [ ] File attachments
- [ ] Image understanding
- [ ] Data visualization in responses

**Week 18-20: Enterprise**
- [ ] Admin analytics dashboard
- [ ] Quality monitoring
- [ ] Custom training for tenant-specific terms
- [ ] Bulk action support
- [ ] Advanced workflows

---

## Appendices

### Example Conversations

**Example 1: Simple Q&A**
```
User: How do I request time off?