# Lucidis Backend API

Multi-tenant unified inbox platform backend built with Node.js, Express, PostgreSQL, Prisma, and Redis.

## Features

- ✅ Multi-tenant architecture (AppOwner → Account → Workspace → Department → Team)
- ✅ JWT-based authentication with refresh tokens
- ✅ Row-Level Security (RLS) policies
- ✅ Unified inbox with conversations and messages
- ✅ Real-time updates with Socket.IO
- ✅ Redis caching
- ✅ Role-based access control

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Cache**: Redis
- **Real-time**: Socket.IO
- **Authentication**: JWT (jsonwebtoken)
- **Security**: Helmet, CORS, Rate Limiting

## Setup

### Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Redis 7+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up database:
```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

4. Start services with Docker:
```bash
docker-compose up -d
```

5. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/register/app-owner` - Register app owner
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Accounts (AppOwner only)
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts` - List accounts
- `GET /api/v1/accounts/:id` - Get account
- `PUT /api/v1/accounts/:id` - Update account
- `DELETE /api/v1/accounts/:id` - Delete account

### Workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces?accountId=xxx` - List workspaces
- `GET /api/v1/workspaces/:id?accountId=xxx` - Get workspace
- `PUT /api/v1/workspaces/:id?accountId=xxx` - Update workspace
- `DELETE /api/v1/workspaces/:id?accountId=xxx` - Delete workspace

### Departments
- `POST /api/v1/departments?workspaceId=xxx` - Create department
- `GET /api/v1/departments?workspaceId=xxx` - List departments
- `GET /api/v1/departments/:id?workspaceId=xxx` - Get department
- `PUT /api/v1/departments/:id?workspaceId=xxx` - Update department
- `DELETE /api/v1/departments/:id?workspaceId=xxx` - Delete department

### Teams
- `POST /api/v1/teams?departmentId=xxx` - Create team
- `GET /api/v1/teams?departmentId=xxx` - List teams
- `GET /api/v1/teams/:id?departmentId=xxx` - Get team
- `PUT /api/v1/teams/:id?departmentId=xxx` - Update team
- `DELETE /api/v1/teams/:id?departmentId=xxx` - Delete team
- `POST /api/v1/teams/:teamId/invite` - Invite user to team

### Inbox
- `GET /api/v1/inbox/conversations?workspaceId=xxx` - List conversations
- `GET /api/v1/inbox/conversations/:id?workspaceId=xxx` - Get conversation
- `GET /api/v1/inbox/conversations/:conversationId/messages?workspaceId=xxx` - Get messages
- `POST /api/v1/inbox/mock-message` - Create mock message

## Socket.IO Events

### Client → Server
- `join-workspace` - Join workspace room
- `leave-workspace` - Leave workspace room

### Server → Client
- `new-message` - New message received
- `joined-workspace` - Successfully joined workspace
- `error` - Error occurred

## Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database, Redis configs
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Auth, tenant, error handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── socket/          # Socket.IO setup
│   ├── utils/           # Utilities (JWT, password, logger)
│   ├── __tests__/       # Test files
│   ├── app.js           # Express app setup
│   └── server.js        # Server entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── docker-compose.yml   # Docker services
└── package.json
```

## Environment Variables

See `.env.example` for all required environment variables.

## License

ISC

