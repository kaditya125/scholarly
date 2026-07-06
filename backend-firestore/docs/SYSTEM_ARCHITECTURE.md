# Scholarly AI - System Architecture (Phase 6)

## 1. Executive Summary
The Phase 6 architecture of Scholarly AI introduces a highly sophisticated, decoupled, and event-driven ecosystem. Designed to support autonomous agentic operations, real-time contextual adaptation, and massive scalability, the system relies on an interplay between a proprietary Multi-LLM Router, a centralized EventBus, a Global Context Engine, and a robust Multi-Agent Workflow Engine. 

## 2. High-Level Architecture
The architecture is structured around microservices and serverless functions communicating asynchronously to maintain high throughput and low latency.

```mermaid
graph TD
    Client[Client Web/Mobile Apps] -->|REST/GraphQL/WSS| APIGateway[API Gateway]
    APIGateway --> AuthService[Authentication & Authz]
    AuthService --> CoreAPI[Core Backend API]
    
    subgraph Core Intelligent System
        CoreAPI <--> EventBus{EventBus (Pub/Sub)}
        EventBus <--> WorkflowEngine[Multi-Agent Workflow Engine]
        EventBus <--> GlobalContext[Global Context Engine - Exam Mode]
        
        WorkflowEngine <--> MultiLLMRouter[Multi-LLM Router]
        WorkflowEngine <--> RAGPipeline[RAG Pipeline]
        WorkflowEngine <--> CoachService[AI Coach]
    end
    
    subgraph Data & Storage Layer
        CoreAPI --> Firestore[(Google Cloud Firestore)]
        RAGPipeline --> VectorStore[(Vector Database)]
        GlobalContext --> RedisCache[(Redis Memory Store)]
        CoachService --> GraphDB[(Knowledge Graph)]
    end
```

## 3. Core Components

### 3.1 Global Context Engine (Exam Mode)
Maintains the state of the user's current environment. During "Exam Mode", it temporarily isolates the user's session, blocking external context pollution and ensuring strict environment constraints (timer, anti-cheat, strict RAG constraints).

### 3.2 EventBus
A high-throughput message broker that orchestrates asynchronous communication between services. When a student submits a notebook or completes an assessment, events are fired that trigger planners, graders, and AI Coach interventions.

### 3.3 Multi-Agent Workflow Engine
Manages stateful, multi-step operations where different AI personas (e.g., Grader, Tutor, Planner) interact to fulfill a complex user request.

### 3.4 Multi-LLM Router
Dynamically routes prompts to different LLM providers (e.g., Gemini 1.5 Pro, GPT-4o, Claude 3.5 Sonnet) based on latency, cost, and task complexity.

## 4. Subsystem Interactions

| Subsystem | Primary Function | Synchronous/Asynchronous | Data Store |
|-----------|------------------|--------------------------|------------|
| API Gateway | Routing & Rate Limiting | Synchronous | N/A |
| Workflow Engine | Multi-Agent Orchestration | Asynchronous (Event-driven)| Firestore (State) |
| Global Context | Session Management | Synchronous | Redis |
| Multi-LLM Router| Cost/Latency Optimization | Synchronous | N/A |
