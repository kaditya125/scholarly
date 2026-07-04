import { RoomsRepository } from '../repositories/rooms.repository';

export class RoomsService {
  private repository = new RoomsRepository();

  async getRooms() {
    return this.repository.findAll();
  }
}
