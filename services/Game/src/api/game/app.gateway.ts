import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, Logger, UseGuards } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { AuthGuard } from './app.guard';
import { AuthService, User } from './app.service';

import { ClassicGame } from './modes';

interface UserInput {
  input: string;
  userId: string;
}
interface AuthenticatedSocket extends Socket {
  user: User;
}

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:8000',
    credentials: true,
  },
})
@UseGuards(AuthGuard)
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    @Inject('AUTH_SERVICE') private readonly authService: AuthService,
  ) {}
  private server: Server;
  private logger: Logger = new Logger('AppGateway');

  //game object
  private games: Array<ClassicGame> = Array<ClassicGame>();
  private playerToGameIdx: Map<string, number> = new Map<string, number>();

  afterInit(server: Server): void {
    this.server = server;
    this.logger.log('Init');
  }

  async handleConnection(client: Socket): Promise<void> {
    // let tmp : any = client;
    // console.log(tmp)
    const cookie = client.handshake.headers.cookie;
    const user = await this.authService.isAuthenticated(cookie);
    if (!user) client.conn.close(true);
    else this.logger.log('Client Connected :' + user.username);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const cookie = client.handshake.headers.cookie;
    const user = await this.authService.isAuthenticated(cookie);
    if (!user) return;

    this.logger.log('Client Disconnected :' + client.id);

    if (this.playerToGameIdx.has(client.id)) {
      console.log('game idx ', this.playerToGameIdx.get(client.id));
      this.games[this.playerToGameIdx.get(client.id)].toggleGameState();
      if (
        this.games[this.playerToGameIdx.get(client.id)].getPlayers().length != 2
      )
        this.games[this.playerToGameIdx.get(client.id)].players.push('-1');
      //this.games.slice(this.playerToGameIdx.get(client.id), 1);
      this.playerToGameIdx.delete(client.id);
    }
  }

  @SubscribeMessage('playerJoined')
  joinRoom(socket: AuthenticatedSocket): void {
    console.log(socket.user);
    const roomName: string = socket.id;
    console.log(roomName);

    // if (this.playerToGameIdx.has(socket.id)) {
    //   console.log(this.games[this.playerToGameIdx[socket.id]].getPlayers());
    //   if (this.games[this.playerToGameIdx[socket.id]].getPlayers().length == 2)
    //     this.games[this.playerToGameIdx[socket.id]].toggleGameState();
    //   return;
    // }

    if (this.games.length) {
      if (this.games[this.games.length - 1].getPlayers().length < 2) {
        this.games[this.games.length - 1].addPlayer(socket.id);
        socket.join(this.games[this.games.length - 1].room);
        console.log('Joined game idx=' + (this.games.length - 1), roomName); // not this room
      } else {
        this.games.push(new ClassicGame(this.server));
        this.games[this.games.length - 1].addPlayer(socket.id);
        this.games[this.games.length - 1].setRoomName(roomName);
        socket.join(roomName);
        console.log('Created game idx=' + (this.games.length - 1), roomName);
      }
    } else {
      this.games.push(new ClassicGame(this.server));
      this.games[0].addPlayer(socket.id);
      this.games[0].setRoomName(roomName);
      socket.join(roomName);
      console.log('created game idx=' + 0, roomName);
    }

    this.playerToGameIdx.set(socket.id, this.games.length - 1);
  }

  @SubscribeMessage('playerInput')
  handlePlayerInput(client: Socket, payload: UserInput): void {
    this.games[this.playerToGameIdx.get(client.id)].handleInput({
      ...payload,
      userId: client.id,
    });
  }
}
