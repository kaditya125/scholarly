import { DiscussionsRepository } from '../repositories/discussions.repository';

export class DiscussionsService {
  private repository = new DiscussionsRepository();

  async getDiscussions(roomId?: string, limit?: number) {
    return this.repository.findByRoom(roomId, limit);
  }
}
