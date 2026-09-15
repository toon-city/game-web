import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgFor } from '@angular/common';
import { RemoteChatMessagePayload, RemotePrivateMessagePayload } from '@toon-live/game-types';
import { SocketService } from '../../../../core/services/socket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { FriendService } from '../../../../core/services/friend.service';
import { Subscription } from 'rxjs';

/** Unifies public chat + private messages into one renderable list. */
interface ChatEntry {
  id: string;
  userId: string;
  username: string;
  rank: number;
  text: string;
  sentAt: number;
  isPrivate: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, NgFor],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() roomId = '';
  @ViewChild('msgList') msgListRef!: ElementRef<HTMLDivElement>;

  private socket = inject(SocketService);
  private auth = inject(AuthService);
  private friendService = inject(FriendService);
  private subs: Subscription[] = [];
  private shouldScrollToBottom = false;
  /**
   * Public chat is one STOMP topic broadcast to the whole room — the server
   * can't filter it per-recipient without a bigger fan-out rewrite, so a
   * blocked user's messages are hidden here instead. Private messages are
   * already rejected server-side for a blocked pair (RoomModerationService.
   * sendPrivateMessage), this is just defense in depth for those (e.g. a
   * block made mid-session doesn't retroactively hide anything already
   * rendered, but stops anything new).
   */
  private blockedIds = new Set<string>();

  messages = signal<ChatEntry[]>([]);
  historyOpen = signal(false);
  text = '';

  readonly myUserId = () => this.auth.user()?.id ?? '';

  toggleHistory(): void {
    this.historyOpen.update(v => !v);
    if (this.historyOpen()) {
      this.shouldScrollToBottom = true;
    }
  }

  ngOnInit(): void {
    this.friendService.status().subscribe({
      next: (s) => { this.blockedIds = new Set(s.blocked.map(b => b.userId)); },
      error: () => {},
    });

    this.subs.push(
      this.socket.chatMessage$.subscribe((msg: RemoteChatMessagePayload) => {
        if (this.blockedIds.has(msg.userId)) return;
        this.messages.update((msgs) => [...msgs, { ...msg, isPrivate: false }]);
        this.shouldScrollToBottom = true;
      }),
      this.socket.privateMessage$.subscribe((msg: RemotePrivateMessagePayload) => {
        if (this.blockedIds.has(msg.fromUserId)) return;
        this.messages.update((msgs) => [...msgs, {
          id: `mp-${msg.fromUserId}-${msg.sentAt}`,
          userId: msg.fromUserId,
          username: msg.fromUsername,
          rank: 0,
          text: msg.text,
          sentAt: Date.parse(msg.sentAt) || Date.now(),
          isPrivate: true,
        }]);
        this.shouldScrollToBottom = true;
      }),
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.shouldScrollToBottom = false;
      const el = this.msgListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  send(): void {
    const t = this.text.trim();
    if (!t) return;
    this.socket.sendChatMessage(this.roomId, t);
    this.text = '';
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }
}
