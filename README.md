# CronoAPI - Desktop Ticket System and Chat Application

A complete Express.js API server with MongoDB for a desktop ticket system and chat application. This API provides authentication, ticket management, real-time messaging, and file upload capabilities.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Ticket Management**: Create, update, assign, and track support tickets
- **Real-time Chat**: Socket.io powered messaging system with conversations
- **File Uploads**: Support for attachments in tickets and messages with image processing
- **User Management**: Complete user profiles with avatar support
- **Search & Filtering**: Advanced search capabilities for tickets and messages
- **Security**: Rate limiting, CORS, helmet security headers, input validation
- **Logging**: Comprehensive request logging and terminal output for API interactions

## Tech Stack

- **Backend**: Express.js, Node.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer with Sharp for image processing
- **Real-time**: Socket.io
- **Security**: Helmet, CORS, Rate limiting
- **Validation**: Express-validator
- **Development**: Nodemon for hot reloading

## Project Structure

```
cronoapi/
├── models/                 # MongoDB models
│   ├── User.js            # User model with authentication
│   ├── Ticket.js          # Ticket model with comments and attachments
│   ├── Conversation.js    # Conversation model for chat
│   └── Message.js         # Message model with reactions and replies
├── routes/                # API routes
│   ├── auth.js           # Authentication routes
│   ├── users.js          # User management routes
│   ├── tickets.js        # Ticket management routes
│   ├── conversations.js  # Conversation management routes
│   └── messages.js       # Message management routes
├── middleware/            # Express middleware
│   ├── auth.js           # JWT authentication middleware
│   ├── errorHandler.js   # Error handling middleware
│   ├── validation.js     # Input validation middleware
│   └── upload.js         # File upload middleware
├── uploads/              # File upload directory
│   ├── avatars/         # User avatar uploads
│   ├── attachments/     # Ticket/message attachments
│   └── thumbnails/      # Generated image thumbnails
├── server.js            # Main server file
├── package.json         # Dependencies and scripts
├── env.example          # Environment variables template
└── README.md           # This file
```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cronoapi
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/cronoapi

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=7d

   # CORS Configuration
   CORS_ORIGIN=http://localhost:3000

   # File Upload
   MAX_FILE_SIZE=10485760
   UPLOAD_PATH=./uploads

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Start MongoDB**
   Make sure MongoDB is running on your system. You can use:
   - Local MongoDB installation
   - MongoDB Atlas (cloud)
   - Docker: `docker run -d -p 27017:27017 mongo`

5. **Start the server**
   ```bash
   # Development mode with nodemon
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh JWT token

### Users
- `GET /api/users` - Get all users (Admin/Support only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `PUT /api/users/:id/avatar` - Update user avatar
- `DELETE /api/users/:id` - Deactivate user (Admin only)
- `GET /api/users/support/team` - Get support team members

### Tickets
- `GET /api/tickets` - Get all tickets
- `POST /api/tickets` - Create new ticket
- `GET /api/tickets/:id` - Get specific ticket
- `PUT /api/tickets/:id` - Update ticket
- `DELETE /api/tickets/:id` - Delete ticket (Admin only)
- `POST /api/tickets/:id/comments` - Add comment to ticket
- `POST /api/tickets/:id/attachments` - Upload attachments
- `PUT /api/tickets/:id/assign` - Assign ticket
- `GET /api/tickets/stats` - Get ticket statistics

### Conversations
- `GET /api/conversations` - Get user's conversations
- `POST /api/conversations` - Create new conversation
- `POST /api/conversations/direct` - Create or get direct conversation
- `GET /api/conversations/:id` - Get specific conversation
- `PUT /api/conversations/:id` - Update conversation
- `DELETE /api/conversations/:id` - Delete conversation
- `POST /api/conversations/:id/participants` - Add participant
- `DELETE /api/conversations/:id/participants/:userId` - Remove participant

### Messages
- `GET /api/conversations/:id/messages` - Get messages for conversation
- `POST /api/conversations/:id/messages` - Send message
- `GET /api/messages/:id` - Get single message
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reactions` - Add reaction
- `DELETE /api/messages/:id/reactions/:emoji` - Remove reaction
- `PUT /api/messages/:id/read` - Mark message as read
- `GET /api/messages/search` - Search messages

## User Roles

- **User**: Can create tickets, participate in conversations, manage own profile
- **Support**: Can handle tickets, access all conversations, manage users
- **Admin**: Full system access, can manage all resources

## Real-time Features

The API includes Socket.io for real-time messaging:

```javascript
// Connect to Socket.io
const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Join conversation
socket.emit('join-conversation', conversationId);

// Listen for new messages
socket.on('newMessage', (data) => {
  console.log('New message:', data.message);
});

// Listen for message updates
socket.on('messageUpdated', (data) => {
  console.log('Message updated:', data.message);
});
```

## File Upload

The API supports file uploads for:
- User avatars (images only, 2MB max)
- Ticket attachments (various types, 10MB max)
- Message attachments (various types, 10MB max)

### Supported File Types
- **Images**: JPEG, PNG, GIF, WebP
- **Documents**: PDF, DOC, DOCX, XLS, XLSX, CSV
- **Archives**: ZIP, RAR
- **Text**: TXT

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcryptjs with salt rounds
- **Rate Limiting**: Prevents abuse and brute force attacks
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers protection
- **Input Validation**: Comprehensive request validation
- **File Upload Security**: Type and size restrictions

## Error Handling

All API responses follow a consistent format:

```json
{
  "success": true/false,
  "message": "Description of result",
  "data": {}, // actual data
  "error": {} // error details if applicable
}
```

## Development

### Running in Development Mode
```bash
npm run dev
```

### Testing
```bash
npm test
```

### Environment Variables
Make sure to set all required environment variables in your `.env` file. See `env.example` for reference.

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Configure proper CORS origins
4. Set up MongoDB with authentication
5. Use a reverse proxy (nginx) for SSL termination
6. Monitor logs and set up proper logging

## API Documentation

The API includes comprehensive logging to the terminal [[memory:669458]] showing:
- User registrations and logins
- Ticket creation, updates, and assignments
- Message sending and conversation activity
- File uploads and user interactions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions, please create an issue in the repository or contact the development team.

