import { Request, Response, NextFunction } from 'express';
import { RoomsService } from '../services/rooms.service';

export class RoomsController {
  private service = new RoomsService();

  public getRooms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rooms = await this.service.getRooms();
      res.json(rooms);
    } catch (error) {
      next(error);
    }
  };
}
